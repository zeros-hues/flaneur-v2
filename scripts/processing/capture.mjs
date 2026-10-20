import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { databaseUrl, safeFailure } from '../phase0/environment.mjs';

const args = process.argv.slice(2);
let connection;
const shutdown = new AbortController(), stop = () => shutdown.abort();
try {
  if (!args.length || (args.length === 1 && args[0] === '--check')) {
    console.log(JSON.stringify({ status: 'controlled_capture_worker_prepared', worker_started: false,
      command: 'npm run worker:capture -- --run [--watch]', historical_queue: false, providers_enabled: false, connection_setting: 'DIRECT_URL' }));
  } else {
    if (args[0] !== '--run' || args.length > 2 || (args[1] && args[1] !== '--watch'))
      throw Object.assign(new Error('Invalid options'), { code: 'INVALID_WORKER_OPTIONS' });
    const outfile = resolve('node_modules/.cache/flaneur/capture-worker.mjs');
    await build({ stdin: { contents: `export {runCaptureCycle} from './scripts/processing/capture-runtime';
      export {liveCaptureProviders} from './lib/processing/capture-semantic';`, resolveDir: process.cwd() },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const { runCaptureCycle, liveCaptureProviders } = await import(pathToFileURL(outfile).href);
    connection = postgres(databaseUrl('DIRECT_URL'), { max: 2, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    do {
      const report = await runCaptureCycle(connection, process.env, liveCaptureProviders,
        { maxJobs: 5, maxRuntimeMs: 30000, leaseDurationMs: 300000, signal: shutdown.signal });
      console.log(JSON.stringify({ status: 'controlled_capture_cycle', ...report, historical_queue: false }));
      if (!args.includes('--watch') || shutdown.signal.aborted) break;
      await new Promise(resolve => { const done = () => { clearTimeout(timer); shutdown.signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, 5000); shutdown.signal.addEventListener('abort', done, { once: true }); });
    } while (!shutdown.signal.aborted);
  }
} catch (error) { safeFailure(error); process.exitCode = 1; }
finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  await connection?.end({ timeout: 5 });
}

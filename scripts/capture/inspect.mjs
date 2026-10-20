import { build } from 'esbuild';
import postgres from 'postgres';
import { databaseUrl, safeFailure } from '../phase0/environment.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
let connection;
try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || (args[0] !== '--latest' && !/^--request-id=[0-9a-f-]{36}$/i.test(args[0])))
    throw Object.assign(new Error('Invalid options'), { code: 'CAPTURE_REQUEST_ID_REQUIRED' });
  const compiled = await build({ entryPoints: ['scripts/capture/inspect.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const { inspectCapture } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  connection = postgres(databaseUrl('DIRECT_URL'), { max: 1, connect_timeout: 15, onnotice: () => {} });
  let requestId = args[0].slice('--request-id='.length);
  if (args[0] === '--latest') {
    const state = JSON.parse(readFileSync('node_modules/.cache/flaneur/controlled-dev/activation.json', 'utf8'));
    const url = new URL(process.env.DIRECT_URL);
    if (state.databaseFingerprint !== createHash('sha256').update(url.hostname + url.pathname).digest('hex') || !Number.isFinite(Date.parse(state.since)))
      throw Object.assign(new Error('Invalid activation'), { code: 'CAPTURE_DEV_TARGET_CHANGED' });
    const [latest] = await connection.begin('isolation level repeatable read read only', async sql => {
      await sql`set local statement_timeout='5s'`;
      return sql`select id from public.capture_request where received_at>=${state.since}::timestamptz order by received_at desc,id desc limit 1`;
    });
    if (!latest) throw Object.assign(new Error('No controlled captures'), { code: 'CAPTURE_NOT_FOUND' });
    requestId = latest.id;
  }
  console.log(JSON.stringify(await inspectCapture(connection, requestId), null, 2));
} catch (error) { safeFailure(error); process.exitCode = 1; }
finally { await connection?.end({ timeout: 2 }); }

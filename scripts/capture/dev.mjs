import { spawn } from 'node:child_process';
import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { createServer as reserveServer } from 'node:net';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { databaseUrl, safeFailure } from '../phase0/environment.mjs';
import { loadCaptureEnvironment, nextEnvValue } from './next-env.mjs';
import { prepareLocalCertificate } from './local-certificate.mjs';

// Local loopback only. No system trust installation, hosting, deployment or .env edits.
const args = process.argv.slice(2), children = [];
let server;
const stop = () => { server?.closeAllConnections(); server?.close(); for (const child of children) child.kill(); };
try {
  if (!args.length || (args.length === 1 && args[0] === '--check')) {
    console.log(JSON.stringify({ status: 'controlled_capture_dev_prepared', started: false,
      command: 'npm run capture:dev -- --run --hosts=www.linkedin.com,selected-project-host',
      origin: 'https://localhost:3443', database_setting: 'DIRECT_URL', environment_file_modified: false }));
  } else {
    if (args.length !== 2 || args[0] !== '--run' || !/^--hosts=[a-z0-9.-]+(?:,[a-z0-9.-]+)*$/.test(args[1]))
      throw Object.assign(new Error('Invalid options'), { code: 'INVALID_CAPTURE_DEV_OPTIONS' });
    if(!existsSync('.next/BUILD_ID'))throw Object.assign(new Error('Build required'),{code:'CAPTURE_BUILD_REQUIRED'});
    loadCaptureEnvironment(process.cwd());
    const direct = databaseUrl('DIRECT_URL');
    if (!process.env.CAPTURE_SECRET) throw Object.assign(new Error('Missing credential'), { code: 'CAPTURE_CREDENTIAL_REQUIRED' });
    const cache = resolve('node_modules/.cache/flaneur/controlled-dev'); mkdirSync(cache, { recursive: true });
    const statePath = join(cache, 'activation.json'), targetUrl = new URL(direct);
    const databaseFingerprint = createHash('sha256').update(targetUrl.hostname + targetUrl.pathname).digest('hex');
    const saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
    if (saved && (saved.databaseFingerprint !== databaseFingerprint || !Number.isFinite(Date.parse(saved.since))))
      throw Object.assign(new Error('Activation target changed'), { code: 'CAPTURE_DEV_TARGET_CHANGED' });
    const origin = 'https://localhost:3443', since = saved?.since ?? new Date().toISOString();
    if (!saved) writeFileSync(statePath, JSON.stringify({ since, databaseFingerprint }), { mode: 0o600 });
    const env = { ...process.env, DATABASE_URL: direct, DIRECT_URL: direct, OWNER_SESSION_ORIGIN: origin,
      CAPTURE_V2_ENABLED: 'true', CAPTURE_V2_ACTIVATED_AT: since, CAPTURE_V2_ALLOWED_HOSTS: args[1].slice(8),
      FLANEUR_CAPTURE_APP_URL: origin, FLANEUR_CAPTURE_DEV: 'true' };
    const built = spawn(process.execPath, ['extension/build.mjs'], { env, stdio: 'inherit', windowsHide: true });
    if (await new Promise(resolve => built.once('exit', resolve)) !== 0) throw new Error('CAPTURE_EXTENSION_BUILD_FAILED');
    const { cert, key } = prepareLocalCertificate(join(cache, 'localhost-tls'));
    const reservation = reserveServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    // Next's dotenv expansion also expands inherited values for keys present in .env.
    const nextEnv = { ...env, DATABASE_URL: nextEnvValue(direct), DIRECT_URL: nextEnvValue(direct),
      CAPTURE_SECRET: nextEnvValue(env.CAPTURE_SECRET),
      ...(env.OWNER_PASSWORD_HASH ? { OWNER_PASSWORD_HASH: nextEnvValue(env.OWNER_PASSWORD_HASH) } : {}) };
    const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
      { env: nextEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); children.push(next);
    // Framework output can contain request details; emit only lifecycle status from this launcher.
    next.stdout.resume(); next.stderr.resume();
    server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
      const upstream = proxyRequest({ hostname: '127.0.0.1', port, path: request.url, method: request.method,
        headers: { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'localhost:3443' } }, result => {
        response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
      });
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end('Local app is starting or unavailable.'); });
      request.pipe(upstream);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3443, '127.0.0.1', resolve); });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    next.once('exit', stop);
    console.log(JSON.stringify({ status: 'controlled_capture_dev_running', origin, activated_at: since,
      allowed_hosts: env.CAPTURE_V2_ALLOWED_HOSTS.split(','), database_setting: 'DIRECT_URL',
      extension_path: 'extension/dev-dist', worker_state: 'starting', local_certificate_authority: true,
      trust_certificate_path: 'node_modules/.cache/flaneur/controlled-dev/localhost-tls/localhost-ca.cer',
      instruction: 'Open the local HTTPS origin and load extension/dev-dist. Local certificate trust needs explicit owner approval; see docs/phase3/LOCAL_CAPTURE_TLS.md. Capture data is sent to configured Groq/Gemini during worker processing.' }));
    // Start the worker only after the local endpoint is accepting connections.
    const worker = spawn(process.execPath, ['scripts/processing/capture.mjs', '--run', '--watch'],
      { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); children.push(worker);
    worker.stdout.on('data', chunk => process.stdout.write(chunk)); worker.stderr.on('data', chunk => process.stderr.write(chunk));
    worker.once('exit', () => { console.error(JSON.stringify({ status: 'controlled_capture_worker_stopped' })); });
  }
} catch (error) { stop(); safeFailure(error); process.exitCode = 1; }

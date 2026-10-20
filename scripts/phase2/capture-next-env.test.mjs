import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nextEnvValue } from '../capture/next-env.mjs';

test('Next dotenv preserves inherited dollar-containing capture credentials and connection values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flaneur-next-env-'));
  const fixture = 'synthetic$segment$more';
  const keys = ['DATABASE_URL', 'DIRECT_URL', 'CAPTURE_SECRET', 'OWNER_PASSWORD_HASH'];
  try {
    writeFileSync(join(directory, '.env'), keys.map(key => key + '=placeholder').join('\n'));
    const entry = createRequire(import.meta.url).resolve('@next/env');
    const output = execFileSync(process.execPath, ['-e',
      'require(process.argv[1]).loadEnvConfig(process.argv[2]);' +
      'process.stdout.write(JSON.stringify(JSON.parse(process.argv[3]).map(key => process.env[key])));',
      entry, directory, JSON.stringify(keys)], {
      encoding: 'utf8',
      env: { ...process.env, ...Object.fromEntries(keys.map(key => [key, nextEnvValue(fixture)])) },
      windowsHide: true,
    });
    assert.deepEqual(JSON.parse(output), keys.map(() => fixture));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('launcher decodes auth:setup escaped hash before the child Next expansion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flaneur-next-env-'));
  const fixture = 'flaneur-scrypt-v1$syntheticSalt$syntheticKey';
  try {
    writeFileSync(join(directory, '.env'), 'OWNER_PASSWORD_HASH="' + nextEnvValue(fixture) + '"\n');
    const helper = fileURLToPath(new URL('../capture/next-env.mjs', import.meta.url));
    const loader = createRequire(import.meta.url).resolve('@next/env');
    const env = { ...process.env };
    delete env.OWNER_PASSWORD_HASH;
    delete env.__NEXT_PROCESSED_ENV;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      'import {pathToFileURL} from "node:url";' +
      'import {execFileSync} from "node:child_process";' +
      'const {loadCaptureEnvironment,nextEnvValue}=await import(pathToFileURL(process.argv[1]).href);' +
      'loadCaptureEnvironment(process.argv[2]);' +
      'const workerValue=process.env.OWNER_PASSWORD_HASH;' +
      'const childValue=execFileSync(process.execPath,["-e",' +
      '"require(process.argv[1]).loadEnvConfig(process.argv[2],false,{info(){},error(){}});process.stdout.write(JSON.stringify(process.env.OWNER_PASSWORD_HASH));",' +
      'process.argv[3],process.argv[2]],{encoding:"utf8",env:{...process.env,OWNER_PASSWORD_HASH:nextEnvValue(workerValue)}});' +
      'process.stdout.write(JSON.stringify({worker:workerValue,next:JSON.parse(childValue)}));',
      helper, directory, loader], { encoding: 'utf8', env, windowsHide: true });
    assert.deepEqual(JSON.parse(output), { worker: fixture, next: fixture });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { prepareLocalCertificate, openssl } from '../capture/local-certificate.mjs';

test('local TLS validates localhost and rejects certificates for other DNS names and IPs', () => {
  const cache = resolve('node_modules/.cache/flaneur');
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, 'tls-qualification-'));
  assert.ok(directory.startsWith(cache + sep));
  const run = args => execFileSync(openssl, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    const files = prepareLocalCertificate(directory);
    const original = new X509Certificate(readFileSync(files.root)).fingerprint256;
    prepareLocalCertificate(directory);
    assert.equal(new X509Certificate(readFileSync(files.root)).fingerprint256, original);
    assert.equal(new X509Certificate(readFileSync(files.cert)).ca, false);
    for (const name of ['localhost', '127.0.0.1', '::1']) {
      run(['verify', '-CAfile', files.root, name === 'localhost' ? '-verify_hostname' : '-verify_ip', name, files.cert]);
    }
    for (const [index, san] of ['DNS:outside.example', 'DNS:localhost,IP:127.0.0.2'].entries()) {
      const prefix = join(directory, 'disallowed-' + index);
      writeFileSync(prefix + '.ext', 'basicConstraints=critical,CA:FALSE\nsubjectAltName=' + san + '\n');
      run(['req', '-new', '-key', files.key, '-out', prefix + '.csr', '-subj', '/CN=localhost']);
      run(['x509', '-req', '-in', prefix + '.csr', '-CA', files.root, '-CAkey', files.rootKey,
        '-set_serial', String(index + 1), '-days', '1', '-extfile', prefix + '.ext', '-out', prefix + '.pem']);
      let rejected = false;
      try { run(['verify', '-CAfile', files.root, prefix + '.pem']); }
      catch (error) { rejected = error.stderr?.toString().includes('permitted subtree violation') === true; }
      assert.ok(rejected, 'Name constraints reject ' + san);
    }
  } finally {
    assert.ok(resolve(directory).startsWith(cache + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});

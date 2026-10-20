import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { X509Certificate, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const openssl = 'C:/Program Files/Git/usr/bin/openssl.exe';
const run = args => execFileSync(openssl, args, { stdio: 'ignore', windowsHide: true });

// Prepares files only. Installing browser/OS trust is a separate owner-approved step.
export function prepareLocalCertificate(directory) {
  mkdirSync(directory, { recursive: true });
  const root = join(directory, 'localhost-ca.pem'), rootKey = join(directory, 'localhost-ca-key.pem');
  const cert = join(directory, 'cert.pem'), key = join(directory, 'key.pem');
  const trust = join(directory, 'localhost-ca.cer');
  let usable = false;
  if ([root, rootKey, cert, key].every(existsSync)) {
    try {
      run(['verify', '-CAfile', root, '-verify_hostname', 'localhost', cert]);
      usable = Date.parse(new X509Certificate(readFileSync(root)).validTo) > Date.now() &&
        Date.parse(new X509Certificate(readFileSync(cert)).validTo) > Date.now();
    } catch { /* Replace incomplete/invalid local generation; never alter trust stores. */ }
  }
  if (!usable) {
    const config = join(directory, 'localhost-ca.conf');
    writeFileSync(config, '[req]\ndistinguished_name=dn\n[dn]\n');
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', rootKey, '-out', root,
      '-days', '7', '-config', config, '-subj', '/CN=Flaneur Localhost Development',
      '-addext', 'subjectKeyIdentifier=hash',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'extendedKeyUsage=serverAuth',
      '-addext', 'nameConstraints=critical,permitted;DNS:localhost,permitted;IP:127.0.0.1/255.255.255.255,permitted;IP:0:0:0:0:0:0:0:1/ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']);
    const csr = join(directory, 'localhost.csr'), extensions = join(directory, 'localhost.ext');
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=localhost']);
    writeFileSync(extensions, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\n');
    run(['x509', '-req', '-in', csr, '-CA', root, '-CAkey', rootKey, '-set_serial',
      '0x' + randomBytes(16).toString('hex'), '-days', '7', '-extfile', extensions, '-out', cert]);
  }
  run(['verify', '-CAfile', root, '-verify_hostname', 'localhost', cert]);
  run(['x509', '-in', root, '-outform', 'DER', '-out', trust]);
  return { cert, key, root, rootKey, trust };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--prepare') throw new Error('PREPARE_OPTION_REQUIRED');
  const files = prepareLocalCertificate(resolve('node_modules/.cache/flaneur/controlled-dev/localhost-tls'));
  const authority = new X509Certificate(readFileSync(files.root));
  console.log(JSON.stringify({ status: 'localhost_certificate_prepared', trust_installed: false,
    certificate: files.trust, subject: authority.subject, expires: authority.validTo,
    sha256: authority.fingerprint256, windows_thumbprint: authority.fingerprint.replaceAll(':', '') }));
}

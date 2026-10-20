# Local Capture TLS trust correction

Prepared 2026-10-20. The owner's extension Network panel reports
`net::ERR_CERT_…` for both health and Capture V2. Its localhost host
permission is granted, the browser can open the health page after a warning,
and the application responds to certificate-verified local health requests.
Seven extension requests report NETWORK_ERROR. No receipt has reached Neon
dev. Accepting the warning in a tab has not enabled extension-worker TLS.

Update: the owner explicitly granted approval. The fingerprint-verified
authority was installed into Cert:\CurrentUser\Root with thumbprint
687E5C9FA44D7E77323B72223D0195ABAE397440. The controlled launcher was restarted
with the original 2026-10-19T16:55:41.321Z activation window and the same two
source hosts. Windows Invoke-WebRequest, with normal certificate validation
and no bypass, returned health 200 / status ok. The bounded worker reports
zero eligible captures and the exact latest-receipt check still reports
CAPTURE_NOT_FOUND. Chrome extension reload and browser verification remain
manual pending steps. No capture or notebook database writes were made.

## Prepared change and validation history

The launcher now prepares a separate server certificate and local authority
under ignored `node_modules/.cache/flaneur/controlled-dev/localhost-tls`.
Both last seven days. The authority has critical name constraints permitting
only localhost DNS names and exact loopback addresses 127.0.0.1 and ::1,
CA path length zero, and TLS-server purpose. The server certificate is
CA:FALSE and has those three subject alternative names. Private keys stay
in ignored local cache and are never imported or printed.

OpenSSL verification accepts all three server names and rejects certificates
signed by this authority for outside.example and 127.0.0.2. Eleven focused
tests pass, including environment decoding and controlled-capture safety.
No Windows trust setting has been changed and the currently running server
still serves the previous certificate. Actual Chrome acceptance remains
unverified pending approval, installation, restart and a fresh browser check.

Reviewed authority: CN=Flaneur Localhost Development.
Expires 2026-10-27 05:36:32 UTC.

SHA-256:
`874E8E91E9976FE5E1DEDD281393EA0D5A9888638A74EE22A0307FBE13FF83E3`

Windows thumbprint:
`687E5C9FA44D7E77323B72223D0195ABAE397440`

## Exact installation — approved and applied

Trust this public authority certificate in the **current Windows account's**
Root store. This is an account-level TLS trust change, outside the repository;
it does not change machine-wide trust or disable certificate verification.
Chrome documents consumption of the current-user Root store:
[Chrome certificate verifier FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md).
The [Microsoft Import-Certificate command](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate)
imports a public certificate without its private key.

```powershell
$captureCertPath = 'D:\_my files\Flaneur\flaneur-v2\node_modules\.cache\flaneur\controlled-dev\localhost-tls\localhost-ca.cer'
if ((Get-FileHash -LiteralPath $captureCertPath -Algorithm SHA256).Hash -ne '874E8E91E9976FE5E1DEDD281393EA0D5A9888638A74EE22A0307FBE13FF83E3') {
    throw 'LOCAL_CERTIFICATE_CHANGED'
}
Import-Certificate -FilePath $captureCertPath -CertStoreLocation 'Cert:\CurrentUser\Root'
```

After approval and installation, restart only the controlled launcher using
the same activation state and approved source hosts. The new launcher serves
the prepared server certificate. Verify TLS and read-only health, then ask
the owner to reload the existing extension (not remove it) and repeat the
credential-free worker health check. Restart Chrome if it retains the old
trust decision; keep its extension storage.

Queued items can resume automatically once TLS works. Do not create more
saves. Inspect all resulting request graphs and distinguish these repeated
Save gestures from the later deliberate duplicate acceptance case.
No database restore, migration, backfill, hosted activation or .env edit is
part of this correction. Expired certificate renewal requires reviewing and
trusting the newly generated authority; the launcher never installs trust.

## Exact removal

After the owner decides the local test certificate is no longer needed,
remove only the reviewed certificate:

```powershell
Remove-Item -LiteralPath 'Cert:\CurrentUser\Root\687E5C9FA44D7E77323B72223D0195ABAE397440'
```

import nextEnv from '@next/env';

// Match Next's parser before passing settings to Node-only workers. Node's
// loadEnvFile preserves the backslashes used by auth:setup to escape dollars.
export function loadCaptureEnvironment(directory) {
  nextEnv.loadEnvConfig(directory, false, { info() {}, error() {} });
  // The child Next process still needs to expand its protected inherited values.
  delete process.env.__NEXT_PROCESSED_ENV;
}

// Next expands inherited values for keys also present in its dotenv files.
// One literal backslash protects each dollar through that single expansion.
export const nextEnvValue = value => value.replaceAll('$', '\\$');

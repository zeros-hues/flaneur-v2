/** The app's URL, injected by build.mjs (config.ts locally, the deployment's URL on Vercel). */
declare const __APP_URL__: string;

/** Bundled as bytes by build.mjs (esbuild's binary loader). */
declare module "*.woff2" {
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}

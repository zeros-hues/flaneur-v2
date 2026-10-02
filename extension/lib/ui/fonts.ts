import interBytes from "../../fonts/inter-latin-var.woff2";
import loraItalicBytes from "../../fonts/lora-latin-italic-400.woff2";

// Private family names, so nothing collides with whatever fonts the page itself loads.
export const INTER = "Flaneur Inter";
export const LORA = "Flaneur Lora";

let registered = false;

/**
 * Registers the bundled faces with the page's font set. The overlay's stacks fall back to
 * system-ui and Georgia, so text is readable before this settles, or if it never does.
 */
export function registerFonts(): void {
  if (registered || typeof FontFace === "undefined") return;
  registered = true;
  const faces = [
    new FontFace(INTER, interBytes, { weight: "400 700", style: "normal" }),
    new FontFace(LORA, loraItalicBytes, { weight: "400", style: "italic" }),
  ];
  for (const face of faces) {
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}

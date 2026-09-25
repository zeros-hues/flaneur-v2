import { CAPTURED_ATTR, UI_ATTR } from "./messages";

const REMOVED_TAGS = "script, style, noscript, svg, link, iframe";
const TRACKING_PREFIXES = ["data-tracking", "data-analytics"];

function isTracking(el: Element): boolean {
  return el.getAttributeNames().some((name) => TRACKING_PREFIXES.some((p) => name.startsWith(p)));
}

// aria-hidden alone is not enough: LinkedIn hides visible names and profile photos
// that way. Only drop hidden elements that carry no text and no image.
function isDecorative(el: Element): boolean {
  if (el.getAttribute("aria-hidden") !== "true") return false;
  if (el.tagName === "IMG" || el.querySelector("img")) return false;
  return (el.textContent ?? "").trim() === "";
}

/**
 * Clones `root` and returns cleaned outerHTML with nesting intact.
 * Drops noise elements, class and style attributes; keeps data-*, componentkey,
 * href, aria-label and other attributes the parser anchors on.
 */
export function serialise(root: Element): string {
  const clone = root.cloneNode(true);
  if (!(clone instanceof Element)) throw new Error("serialise expects an element");

  for (const el of clone.querySelectorAll(REMOVED_TAGS)) el.remove();
  for (const el of clone.querySelectorAll(`[${UI_ATTR}]`)) el.remove();

  // Static NodeList, so removing a subtree mid-loop is safe.
  for (const el of clone.querySelectorAll("*")) {
    if (!clone.contains(el)) continue; // inside a subtree already removed
    if (isTracking(el) || isDecorative(el)) {
      el.remove();
      continue;
    }
    el.removeAttribute("class");
    el.removeAttribute("style");
    el.removeAttribute(CAPTURED_ATTR);
  }
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.removeAttribute(CAPTURED_ATTR);

  return clone.outerHTML;
}

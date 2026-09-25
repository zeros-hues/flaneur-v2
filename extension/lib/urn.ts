// Post URN extraction. LinkedIn's post cards carry no URN data attribute, so we try,
// in order, the sources observed in real captured HTML:
//   1. <a href=".../feed/update/urn:li:activity:N/">          (profile activity cards)
//   2. componentkey="replaceableComment_urn:li:comment:(activity:N,...)"  (feed, when a comment renders)
//   3. id="<base64>-replaceableCommentTools..."               (feed cards)
// Source 3 is a protobuf; only the "Cg..." shape is verified to decode to an activity id.

const UPDATE_HREF = /\/feed\/update\/(urn:li:[A-Za-z]+:\d+)/;
const COMMENT_KEY = /urn:li:comment:\((activity|ugcPost):(\d+),/;
const ENCODED_ID = /^([A-Za-z0-9+/]+={0,2})-replaceableCommentTools/;

function fromHref(container: Element): string | null {
  for (const a of container.querySelectorAll('a[href*="/feed/update/urn:li:"]')) {
    const match = UPDATE_HREF.exec(a.getAttribute("href") ?? "");
    if (match?.[1]) return match[1];
  }
  return null;
}

function fromCommentKey(container: Element): string | null {
  for (const el of container.querySelectorAll('[componentkey*="urn:li:comment:("]')) {
    const match = COMMENT_KEY.exec(el.getAttribute("componentkey") ?? "");
    if (match?.[1] && match[2]) return `urn:li:${match[1]}:${match[2]}`;
  }
  return null;
}

function readVarint(bytes: Uint8Array, start: number): bigint | null {
  let value = 0n;
  let shift = 0n;
  for (let i = start; i < bytes.length && shift < 70n; i++) {
    const byte = bytes[i];
    if (byte === undefined) return null;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  return null;
}

/** Decodes `0a <len> 08 <zigzag varint>` → activity id. Any other shape returns null. */
export function decodeActivityId(encoded: string): string | null {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes[0] !== 0x0a || bytes[2] !== 0x08) return null;
  const raw = readVarint(bytes, 3);
  if (raw === null) return null;
  const id = (raw >> 1n) ^ -(raw & 1n);
  return id > 0n ? id.toString() : null;
}

function fromEncodedId(container: Element): string | null {
  for (const el of container.querySelectorAll('[id*="-replaceableCommentTools"]')) {
    const match = ENCODED_ID.exec(el.id);
    const id = match?.[1] ? decodeActivityId(match[1]) : null;
    if (id) return `urn:li:activity:${id}`;
  }
  return null;
}

export function findPostUrn(container: Element): string | null {
  return fromHref(container) ?? fromCommentKey(container) ?? fromEncodedId(container);
}

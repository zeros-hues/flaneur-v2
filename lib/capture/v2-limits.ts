// Conservative application bounds; actual hosting capacity still needs deployment verification.
// JSON escaping counts toward the request bound independently of the decoded HTML bound.
export const CAPTURE_V2_REQUEST_BYTES = 4_000_000;
export const CAPTURE_V2_HTML_BYTES = 3_000_000;

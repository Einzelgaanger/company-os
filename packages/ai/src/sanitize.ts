/**
 * Pre-reader sanitization — strip injection-prone noise before the model sees it.
 */
export type SanitizeResult = {
  text: string;
  stripped: string[];
};

const ZWSP_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const HTML_RE = /<\/?[a-z][^>]*>/gi;
const BASE64_BLOB_RE = /(?:[A-Za-z0-9+/]{200,}={0,2})/g;
const QUOTED_REPLY_RE = /(?:^|\n)(?:>+[^\n]*\n?)+/g;

export function sanitizeUntrusted(input: string): SanitizeResult {
  const stripped: string[] = [];
  let text = input ?? "";

  if (HTML_RE.test(text)) {
    stripped.push("html_tags");
    text = text.replace(HTML_RE, " ");
  }
  if (ZWSP_RE.test(text)) {
    stripped.push("zwsp_bidi");
    text = text.replace(ZWSP_RE, "");
  }
  if (BASE64_BLOB_RE.test(text)) {
    stripped.push("base64_blob");
    text = text.replace(BASE64_BLOB_RE, "[base64-stripped]");
  }
  if (QUOTED_REPLY_RE.test(text)) {
    stripped.push("quoted_reply");
    text = text.replace(QUOTED_REPLY_RE, "\n");
  }

  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, stripped };
}

// Shared plain-text → safe HTML renderer, used by Compose (send + preview) and
// the Templates cards so link/line-break rendering stays identical everywhere.
// User text is escaped first; `{{…}}` merge tokens and `[First name]`-style
// friendly tokens pass through untouched (only `[label](url)` becomes a link).

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LINK = 'color:#2563eb;text-decoration:underline';

// blank line = new paragraph, single newline = line break. Links: `[label](url)`
// → named anchor; a bare http(s) URL also becomes clickable. Guarded against
// double-wrapping (a URL already inside an anchor is skipped).
export function plainToHtml(text: string) {
  let body = escapeHtml((text || '').trim())
    // named links: [Reserve on OpenTable](https://…)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" style="${LINK}">$1</a>`);
  // bare URLs not already inside a tag (not preceded by " ' or >)
  body = body.replace(/(^|[^"'>])(https?:\/\/[^\s<]+[^\s<.,;:)\]}"'])/g, `$1<a href="$2" style="${LINK}">$2</a>`);
  return body.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

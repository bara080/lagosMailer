// ─────────────────────────────────────────────────────────────────────────────
// Generic RFC822 message builder.
//
// Produces a message string for SmtpClient.sendMessage(). Handles:
//   - text-only, html-only, or multipart/alternative (both)
//   - optional attachments (wraps the body in multipart/mixed)
//   - custom extra headers (Reply-To, List-Unsubscribe, etc.)
//
// No Zinga-specific copy lives here — you pass in whatever subject/body you want.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
function boundary(tag) {
  seq += 1;
  return `=_lagos_${tag}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function b64chunks(buf) {
  // 76-char lines per RFC 2045.
  return buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

/**
 * @param {object} opts
 * @param {string} opts.from                      From address (bare or "Name <addr>")
 * @param {string} opts.to                         Recipient address
 * @param {string} opts.subject
 * @param {string} [opts.text]                     plain-text body
 * @param {string} [opts.html]                     html body
 * @param {Record<string,string>} [opts.headers]   extra headers (e.g. { 'Reply-To': ... })
 * @param {{ filename: string, content: Buffer, contentType?: string }[]} [opts.attachments]
 * @returns {string} RFC822 message
 */
export function buildMessage(opts) {
  const { from, to, subject, text, html, headers = {}, attachments = [] } = opts;
  if (!text && !html) throw new Error('buildMessage: provide text and/or html');

  const baseHeaders = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ];

  // ── Build the body part (before any attachment wrapping) ──────────────────
  let bodyContentHeader;
  let bodyPart;

  if (text && html) {
    const alt = boundary('alt');
    bodyContentHeader = `Content-Type: multipart/alternative; boundary="${alt}"`;
    bodyPart = [
      `--${alt}`,
      `Content-Type: text/plain; charset="utf-8"`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      text,
      ``,
      `--${alt}`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
      ``,
      `--${alt}--`,
      ``,
    ].join('\r\n');
  } else if (html) {
    bodyContentHeader = `Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit`;
    bodyPart = html;
  } else {
    bodyContentHeader = `Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit`;
    bodyPart = text;
  }

  // ── No attachments: header block + body ───────────────────────────────────
  if (attachments.length === 0) {
    return `${[...baseHeaders, bodyContentHeader].join('\r\n')}\r\n\r\n${bodyPart}`;
  }

  // ── Attachments: wrap everything in multipart/mixed ───────────────────────
  const mixed = boundary('mixed');
  const segments = [
    `--${mixed}`,
    bodyContentHeader,
    ``,
    bodyPart,
    ``,
  ];
  for (const a of attachments) {
    segments.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${a.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      ``,
      b64chunks(a.content),
      ``,
    );
  }
  segments.push(`--${mixed}--`, ``);

  const topHeaders = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${mixed}"`];
  return `${topHeaders.join('\r\n')}\r\n\r\n${segments.join('\r\n')}`;
}

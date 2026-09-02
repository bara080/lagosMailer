import net from 'node:net';
import tls from 'node:tls';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable, dependency-free SMTP client.
//
// STARTTLS on 587/25, implicit TLS on 465, + AUTH LOGIN. Speaks SMTP directly
// over node:net / node:tls, so it needs no third-party package (no nodemailer).
// Server-only; requires the Node.js runtime.
//
// One authenticated connection is reused for a whole batch, so an N-message
// batch is one login + N transactions. Ported from zinga-os and made generic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ code: number, raw: string }} Reply
 * @typedef {{ host: string, port: number, user: string, password: string, ehloName?: string }} SmtpConfig
 */

function makeReader(sock) {
  let buf = '';
  /** @type {{ resolve: (r: Reply) => void, reject: (e: Error) => void }[]} */
  const pending = [];
  /** @type {Reply[]} */
  const ready = [];
  let failed = null; // terminal error once the socket dies — all reads reject
  // Reject every waiting read (and future ones). Called when the connection
  // errors, closes, or goes idle past the socket timeout — so a throttled server
  // that stalls mid-conversation surfaces as a fast failure instead of a hang.
  const fail = (err) => {
    failed = err;
    while (pending.length) pending.shift().reject(err);
  };
  const pump = () => {
    // One complete SMTP reply = zero+ continuation lines (\d{3}-...) then a final
    // line (\d{3}<space>...), each CRLF-terminated.
    for (;;) {
      const m = buf.match(/^(?:\d{3}-[^\r\n]*\r?\n)*\d{3} [^\r\n]*\r?\n/);
      if (!m) break;
      const raw = m[0];
      buf = buf.slice(raw.length);
      const code = parseInt(raw.match(/(\d{3}) [^\r\n]*\r?\n$/)?.[1] ?? '0', 10);
      const reply = { code, raw };
      const next = pending.shift();
      if (next) next.resolve(reply);
      else ready.push(reply);
    }
  };
  sock.on('data', (d) => { buf += d.toString('utf8'); pump(); });
  sock.on('error', (e) => fail(e instanceof Error ? e : new Error('SMTP socket error')));
  sock.on('close', () => fail(new Error('SMTP connection closed')));
  sock.on('timeout', () => { try { sock.destroy(); } catch { /* noop */ } fail(new Error('SMTP timeout (server stalled)')); });
  return {
    /** @returns {Promise<Reply>} */
    read() {
      if (failed) return Promise.reject(failed);
      const r = ready.shift();
      if (r) return Promise.resolve(r);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
}

export class SmtpClient {
  /** @type {net.Socket} */
  sock;
  /** @type {ReturnType<typeof makeReader>} */
  reader;

  constructor() {}

  /**
   * Open, upgrade to TLS, and authenticate. Resolves to a ready-to-send client.
   * @param {SmtpConfig} cfg
   * @returns {Promise<SmtpClient>}
   */
  static async connect(cfg) {
    const c = new SmtpClient();
    const ehlo = cfg.ehloName || 'localhost';
    const secure = cfg.port === 465;
    const sock = secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : net.connect({ host: cfg.host, port: cfg.port });
    sock.setTimeout(30000);
    await new Promise((resolve, reject) => {
      sock.once(secure ? 'secureConnect' : 'connect', () => resolve());
      sock.once('error', reject);
      sock.once('timeout', () => reject(new Error('SMTP connect timeout')));
    });
    c.sock = sock;
    c.reader = makeReader(sock);

    await c.expect([220]); // greeting
    await c.cmd(`EHLO ${ehlo}`, [250]);

    if (!secure) {
      await c.cmd('STARTTLS', [220]);
      const upgraded = tls.connect({ socket: c.sock, servername: cfg.host });
      await new Promise((resolve, reject) => {
        upgraded.once('secureConnect', () => resolve());
        upgraded.once('error', reject);
      });
      upgraded.setTimeout(30000); // arm idle-timeout on the upgraded socket too —
      // the actual send conversation runs here on STARTTLS (587), so without this a
      // stalled/throttled server would hang the read forever.
      c.sock = upgraded;
      c.reader = makeReader(upgraded);
      await c.cmd(`EHLO ${ehlo}`, [250]);
    }

    await c.cmd('AUTH LOGIN', [334]);
    await c.cmd(Buffer.from(cfg.user).toString('base64'), [334]);
    await c.cmd(Buffer.from(cfg.password).toString('base64'), [235]);
    return c;
  }

  write(line) {
    this.sock.write(line + '\r\n');
  }

  /** @param {number[]} codes @returns {Promise<Reply>} */
  async expect(codes) {
    const r = await this.reader.read();
    if (!codes.includes(r.code)) {
      throw new Error(`SMTP unexpected reply ${r.code}: ${r.raw.trim()}`);
    }
    return r;
  }

  /** @param {string} line @param {number[]} codes @returns {Promise<Reply>} */
  async cmd(line, codes) {
    this.write(line);
    return this.expect(codes);
  }

  /**
   * Send one already-built RFC822 message. Throws on any SMTP-level rejection.
   * @param {string} from @param {string} to @param {string} message
   */
  async sendMessage(from, to, message) {
    await this.cmd(`MAIL FROM:<${from}>`, [250]);
    await this.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await this.cmd('DATA', [354]);
    // Dot-stuff any line that begins with '.' per RFC 5321, then terminate.
    const body = message.replace(/\r?\n/g, '\r\n').replace(/\r\n\./g, '\r\n..');
    this.sock.write(body + '\r\n.\r\n');
    await this.expect([250]);
  }

  async quit() {
    try {
      await this.cmd('QUIT', [221]);
    } catch {
      /* ignore */
    }
    this.sock.destroy();
  }
}

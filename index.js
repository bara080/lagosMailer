// Public entry for the reusable emailer component.
//
//   import { Emailer, SmtpClient, buildMessage } from 'lagos-mailer';
//
//   const emailer = await Emailer.open({
//     host, port, user, password, from: 'you@domain.com',
//   });
//   await emailer.send({ to: 'a@b.com', subject: 'Hi', html: '<p>hey</p>' });
//   await emailer.close();

import { SmtpClient } from './src/smtp-client.js';
import { buildMessage } from './src/build-message.js';

export { SmtpClient } from './src/smtp-client.js';
export { buildMessage } from './src/build-message.js';
export { loadEnv } from './src/load-env.js';

export class Emailer {
  /**
   * @param {SmtpClient} client
   * @param {{ from: string }} opts
   */
  constructor(client, opts) {
    this.client = client;
    this.from = opts.from;
  }

  /**
   * Open one authenticated SMTP connection to reuse across many sends.
   * @param {object} cfg
   * @param {string} cfg.host
   * @param {number} cfg.port
   * @param {string} cfg.user
   * @param {string} cfg.password
   * @param {string} cfg.from                 default From address
   * @param {string} [cfg.ehloName]           EHLO hostname (defaults to from-domain)
   * @returns {Promise<Emailer>}
   */
  static async open(cfg) {
    // Derive the EHLO hostname from the SENDER'S DOMAIN. `from` may be a
    // "Name <addr>" string, so pull the bare address first, then its domain, and
    // validate it's a clean hostname — otherwise a malformed From breaks the
    // SMTP handshake (501 HELO/EHLO invalid).
    const bare = (String(cfg.from || '').match(/<([^>]+)>/)?.[1] ?? cfg.from ?? '').trim();
    const domain = bare.split('@')[1];
    const ehloName = cfg.ehloName || (domain && /^[a-z0-9.-]+$/i.test(domain) ? domain : 'localhost');
    const client = await SmtpClient.connect({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      ehloName,
    });
    return new Emailer(client, { from: cfg.from });
  }

  /**
   * Build + send one message on the open connection.
   * @param {object} msg
   * @param {string} msg.to
   * @param {string} msg.subject
   * @param {string} [msg.text]
   * @param {string} [msg.html]
   * @param {string} [msg.from]                       override the default From
   * @param {Record<string,string>} [msg.headers]
   * @param {{ filename: string, content: Buffer, contentType?: string }[]} [msg.attachments]
   */
  async send(msg) {
    const from = msg.from || this.from;
    const raw = buildMessage({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      headers: msg.headers,
      attachments: msg.attachments,
    });
    // Envelope-from should be the bare address even if `from` is "Name <addr>".
    const envelopeFrom = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
    await this.client.sendMessage(envelopeFrom, msg.to, raw);
  }

  async close() {
    await this.client.quit();
  }
}

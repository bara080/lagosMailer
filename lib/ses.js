// Amazon SES delivery signals arrive as Amazon SNS messages (the SES
// configuration set has an SNS event destination for Bounce/Complaint/Delivery).
// This verifies the SNS message signature so the public webhook can't be spoofed,
// and confirms subscriptions. Dependency-free (node:crypto + fetch), mirrors the
// shape of lib/resend.js (verifyResendWebhook).
import crypto from 'crypto';

// Fields included in the SNS signature canonical string, in order, per message type.
// (AWS SNS signing spec.) Subject is only present on some Notifications.
const SIG_FIELDS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
};

function canonicalString(msg) {
  const fields = SIG_FIELDS[msg.Type] || SIG_FIELDS.Notification;
  let s = '';
  for (const f of fields) {
    if (msg[f] === undefined || msg[f] === null) continue; // e.g. Subject often absent
    s += `${f}\n${msg[f]}\n`;
  }
  return s;
}

// The signing cert MUST come from an amazonaws.com host over https and be a .pem —
// this prevents an attacker pointing SigningCertURL at their own key.
function validCertUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:'
      && /(^|\.)amazonaws\.com$/.test(url.hostname)
      && url.pathname.endsWith('.pem');
  } catch { return false; }
}

const certCache = new Map(); // url -> pem (certs are stable; cache to avoid refetch)
async function getCertPem(url) {
  if (certCache.has(url)) return certCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SNS cert fetch failed ${res.status}`);
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

// Verify an SNS message envelope. Returns true only when the signature is valid.
export async function verifySnsMessage(msg) {
  if (!msg || !msg.Signature || !msg.SigningCertURL) return false;
  if (!validCertUrl(msg.SigningCertURL)) return false;
  const algo = String(msg.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  let pem;
  try { pem = await getCertPem(msg.SigningCertURL); } catch { return false; }
  try {
    const v = crypto.createVerify(algo);
    v.update(canonicalString(msg), 'utf8');
    return v.verify(pem, msg.Signature, 'base64'); // Node accepts the X.509 cert PEM directly
  } catch { return false; }
}

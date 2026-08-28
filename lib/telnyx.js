// Reusable, dependency-free Telnyx SMS client. Sends one message via the Telnyx
// Messaging API (https://developers.telnyx.com/api/messaging/send-message).
// Uses either a `from` number or a `messagingProfileId` (number pool).

export async function sendSms({ apiKey, from, to, text, messagingProfileId }) {
  if (!apiKey) throw new Error('Telnyx API key missing');
  const body = messagingProfileId
    ? { messaging_profile_id: messagingProfileId, to, text }
    : { from, to, text };
  const r = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || `Telnyx error ${r.status}`;
    throw new Error(detail);
  }
  return data?.data ?? data;
}

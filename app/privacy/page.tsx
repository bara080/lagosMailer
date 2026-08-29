// PUBLIC privacy policy + SMS terms. Contains the mobile-data clause required
// for 10DLC / carrier review ("we do not share mobile opt-in data with third
// parties"). Linked from the opt-in form and submitted with the campaign.
export const metadata = { title: 'Privacy Policy · Native Harlem' };

const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '48px 22px 80px', fontFamily: 'system-ui, sans-serif', color: '#e7e2ee', lineHeight: 1.65 };
const h2: React.CSSProperties = { fontSize: 19, marginTop: 34, marginBottom: 8, color: '#fff' };
const p: React.CSSProperties = { color: '#b9b0c6', fontSize: 15, margin: '8px 0' };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#181022' }}>
      <div style={wrap}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#d9b26a', fontWeight: 700 }}>NATIVE HARLEM</div>
        <h1 style={{ fontSize: 30, margin: '6px 0 2px', color: '#fff' }}>Privacy Policy</h1>
        <p style={{ ...p, fontSize: 13 }}>Last updated: August 28, 2026</p>

        <p style={p}>
          Native Harlem (“we”, “us”) operates a restaurant at 2319 Frederick Douglass Blvd, New York, NY 10027.
          This policy explains how we collect, use, and protect your information, including for our SMS text-message program.
        </p>

        <h2 style={h2}>Information we collect</h2>
        <p style={p}>
          When you sign up for our text messages we collect your mobile phone number and, optionally, your name.
          We may also collect information you provide when you contact us or make a reservation.
        </p>

        <h2 style={h2}>How we use your information</h2>
        <p style={p}>
          We use your mobile number to send recurring marketing and informational text messages — event announcements,
          specials, reservation reminders, and similar updates. Message frequency may vary. Message and data rates may apply.
        </p>

        <h2 style={h2}>Mobile information &amp; third parties</h2>
        <p style={p}>
          <strong>We do not sell or share your mobile opt-in information or the fact that you consented to receive SMS with
          any third parties or affiliates for their own marketing or promotional purposes.</strong> Mobile opt-in data is
          used solely to operate our own text-message program. We may share information with service providers that help us
          send messages (for example, our SMS delivery provider), strictly to deliver our messages to you.
        </p>

        <h2 style={h2}>Opting out</h2>
        <p style={p}>
          You can opt out at any time by replying <strong>STOP</strong> to any message. For help, reply <strong>HELP</strong>,
          email us, or call 212 913 0226. After you opt out, we will send one confirmation message and then stop texting you.
        </p>

        <h2 style={h2}>Data retention &amp; security</h2>
        <p style={p}>
          We keep your information only as long as needed to operate our messaging program and meet legal obligations, and we
          use reasonable safeguards to protect it. No method of transmission is 100% secure.
        </p>

        <h2 style={h2}>Contact</h2>
        <p style={p}>Questions? Call 212 913 0226 or visit us at 2319 Frederick Douglass Blvd, New York, NY 10027.</p>

        <hr style={{ margin: '40px 0', border: 0, borderTop: '1px solid #33283f' }} id="terms" />

        <h1 style={{ fontSize: 26, margin: '6px 0 2px', color: '#fff' }}>SMS Terms &amp; Conditions</h1>
        <p style={p}>
          By opting in you agree to receive recurring automated marketing text messages from Native Harlem at the number
          you provide. Consent is not a condition of any purchase. Message frequency may vary. Message and data rates may
          apply. Reply STOP to cancel or HELP for help. Carriers are not liable for delayed or undelivered messages.
          Supported carriers may change without notice.
        </p>
      </div>
    </div>
  );
}

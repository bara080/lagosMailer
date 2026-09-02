'use client';
import { useRouter } from 'next/navigation';
import { FileText, ArrowRight } from 'lucide-react';
import Topbar from '@/components/Topbar';

// Reusable email copy. Bodies use the friendly merge tokens ([First name] etc.)
// that Compose understands and converts to backend {{…}} tokens on send, so a
// template drops straight into the composer with no reformatting.
//
// LEGACY generic B2B templates — kept (commented) for rollback:
// const TEMPLATES = [
//   { name: 'Cold intro', subject: 'Quick question about {{business}}', body: 'Hi {{name}}, I came across {{business}} and think we can help. Would you be open to a quick chat?' },
//   { name: 'Follow-up', subject: 'Following up — {{business}}', body: 'Hi {{name}}, just circling back on my note about {{business}}. Any thoughts?' },
//   { name: 'Free trial offer', subject: 'A free 60-day trial for {{business}}', body: 'Hi {{name}}, we\'re offering new {{category}} businesses a free 60-day trial. Interested?' },
// ];

const RESERVE = 'https://www.opentable.com/r/native-harlem-new-york';
const ADDR = '2319 Frederick Douglass Blvd, Harlem';

const TEMPLATES = [
  {
    name: 'Open Mic Night',
    subject: "You're Invited to Open Mic Night at Native Harlem! 🎤",
    body:
`Hi [First name],

This Wednesday, we're turning up the vibes at Native Harlem! 🎶

Join us for Open Mic Night at 8 PM — a special live performance plus handcrafted cocktails all night. Happy Hour runs until 9 PM with drinks & bites to keep the energy going.

📍 ${ADDR}
🕗 Open Mic starts at 8 PM

Pull up, grab a drink, and catch a vibe!

[Reserve on OpenTable](${RESERVE})`,
  },
  {
    name: 'Afrobeats Brunch',
    subject: 'Afrobeats Brunch is back at Native Harlem 🍹',
    body:
`Hi [First name],

Your weekend just got better. 🌍

Join us Saturday & Sunday for Afrobeats Brunch at Native Harlem — bold, modern Nigerian plates, handcrafted cocktails, and the best afrobeats in the city.

📍 ${ADDR}
🕚 Brunch served 11 AM – 4 PM

Bring the crew and let's turn up.

[Book your table](${RESERVE})`,
  },
  {
    name: 'Private Events & Catering',
    subject: 'Host your next celebration at Native Harlem 🎉',
    body:
`Hi [First name],

Birthday, corporate dinner, or a night out with friends — Native Harlem sets the scene.

We host private events and celebrations with bold modern Nigerian cuisine, handcrafted cocktails, and live entertainment in the heart of Harlem. Full catering available too.

📍 ${ADDR}

Tell us what you're planning and we'll make it unforgettable.

[Reserve now](${RESERVE})`,
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  // Stash the picked template so Compose can prefill it (bodies are multi-line,
  // so sessionStorage beats cramming them into the query string).
  function use(t: (typeof TEMPLATES)[number]) {
    try { sessionStorage.setItem('composeTemplate', JSON.stringify({ name: t.name, subject: t.subject, message: t.body })); } catch {}
    router.push('/compose?template=1');
  }
  return (
    <>
      <Topbar title="Templates" subtitle="Reusable email copy for your campaigns" />
      <div className="page grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {TEMPLATES.map((t) => (
          <div className="card pad" key={t.name}>
            <div className="row gap8"><span className="ic blue"><FileText size={16} /></span><b>{t.name}</b></div>
            <div className="muted mt12" style={{ fontSize: 13, fontWeight: 600 }}>{t.subject}</div>
            <p className="muted" style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{t.body}</p>
            <button className="btn ghost sm mt12" onClick={() => use(t)}>Use in campaign <ArrowRight size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { FileText, ArrowRight } from 'lucide-react';
import Topbar from '@/components/Topbar';

const TEMPLATES = [
  { name: 'Cold intro', subject: 'Quick question about {{business}}', body: 'Hi {{name}}, I came across {{business}} and think we can help. Would you be open to a quick chat?' },
  { name: 'Follow-up', subject: 'Following up — {{business}}', body: 'Hi {{name}}, just circling back on my note about {{business}}. Any thoughts?' },
  { name: 'Free trial offer', subject: 'A free 60-day trial for {{business}}', body: 'Hi {{name}}, we\'re offering new {{category}} businesses a free 60-day trial. Interested?' },
];

export default function TemplatesPage() {
  const router = useRouter();
  return (
    <>
      <Topbar title="Templates" subtitle="Reusable email copy for your campaigns" />
      <div className="page grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {TEMPLATES.map((t) => (
          <div className="card pad" key={t.name}>
            <div className="row gap8"><span className="ic blue"><FileText size={16} /></span><b>{t.name}</b></div>
            <div className="muted mt12" style={{ fontSize: 13, fontWeight: 600 }}>{t.subject}</div>
            <p className="muted" style={{ fontSize: 13 }}>{t.body}</p>
            <button className="btn ghost sm mt12" onClick={() => router.push('/compose')}>Use in campaign <ArrowRight size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

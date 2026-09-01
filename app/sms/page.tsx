'use client';
import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, Eye, Phone, Users, PhoneCall, CheckCircle2, CheckSquare } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { TableSkeleton, EmptyState } from '@/components/ui';
import { useConfig, useLeads, useSendSms } from '@/lib/hooks';

const SEG = 160;       // SMS segment length (GSM-7)
const PER_PAGE = 50;

export default function SmsPage() {
  const { data: config } = useConfig();
  const [page, setPage] = useState(1);
  // Only leads with a phone number, paginated server-side (works at 63k).
  const { data, isLoading } = useLeads({ stage: 'all', hasPhone: true, page, limit: PER_PAGE });
  const sms = useSendSms();

  const pageLeads = data?.leads ?? [];
  const withPhoneTotal = data?.total ?? 0;         // total leads that have a phone
  const counts = data?.counts ?? {};
  const pageCount = Math.max(1, Math.ceil(withPhoneTotal / PER_PAGE));
  const curPage = Math.min(page, pageCount);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [text, setText] = useState('Hi {{name}}, a quick note from our team about {{business}}.');
  const [result, setResult] = useState<any>(null);

  const segments = Math.max(1, Math.ceil(text.length / SEG));
  const pageAllSelected = pageLeads.length > 0 && pageLeads.every((l) => selected.has(l.id));

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function togglePage() {
    setSelected((s) => {
      const n = new Set(s);
      if (pageAllSelected) pageLeads.forEach((l) => n.delete(l.id));
      else pageLeads.forEach((l) => n.add(l.id));
      return n;
    });
  }

  async function run(dryRun: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    setResult(null);
    const out = await sms.mutateAsync({ ids, text, dryRun });
    setResult(out);
  }

  const metrics = [
    { label: 'With phone', icon: <PhoneCall size={16} />, tone: 'cyan', n: withPhoneTotal },
    { label: 'Total leads', icon: <Users size={16} />, tone: 'purple', n: counts.all ?? 0 },
    { label: 'Contacted', icon: <CheckCircle2 size={16} />, tone: 'green', n: counts.contacted ?? 0 },
    { label: 'Selected', icon: <CheckSquare size={16} />, tone: 'blue', n: selected.size },
  ];

  return (
    <>
      <Topbar title="SMS" subtitle="Bulk SMS via Telnyx"
        actions={<span className={`badge ${config?.smsReady ? 'completed' : 'scheduled'}`}>{config?.smsReady ? `Telnyx: ${config?.smsFrom || 'ready'}` : 'Telnyx: not configured'}</span>} />
      <div className="page">
        {/* Small metrics header */}
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {metrics.map((m) => (
            <div key={m.label} className="metric" style={{ textAlign: 'left' }}>
              <div className="top"><span className={`ic ${m.tone}`}>{m.icon}</span><span className="lbl">{m.label}</span></div>
              <div className="val">{isLoading ? '—' : m.n.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="grid mt16" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
          {/* Recipients */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card-h">
              <h3>Recipients <span className="muted" style={{ fontWeight: 400 }}>· {withPhoneTotal.toLocaleString()} with a phone</span></h3>
              <div className="row gap8">
                <button className="btn ghost sm" onClick={togglePage}>{pageAllSelected ? 'Deselect page' : 'Select page'}</button>
                <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            </div>
            {isLoading ? <TableSkeleton rows={6} cols={4} /> :
              pageLeads.length === 0 ? <EmptyState title="No leads with phone numbers" hint="Add phone numbers to leads to send SMS." /> : (
              <>
                <table className="tbl">
                  <thead><tr><th style={{ width: 34 }} /><th>Lead</th><th>Phone</th><th>Stage</th></tr></thead>
                  <tbody>
                    {pageLeads.map((l) => (
                      <tr key={l.id}>
                        <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                        <td><b>{l.business || l.name || '—'}</b></td>
                        <td className="muted"><Phone size={12} /> {l.phone}</td>
                        <td><span className={`badge ${l.stage}`}>{l.stage}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {withPhoneTotal > PER_PAGE && (
                  <div className="row between" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                    <span className="faint" style={{ fontSize: 12.5 }}>
                      Showing <b>{(curPage - 1) * PER_PAGE + 1}</b>–<b>{Math.min(curPage * PER_PAGE, withPhoneTotal)}</b> of <b>{withPhoneTotal.toLocaleString()}</b>
                    </span>
                    <span className="row gap8">
                      <button className="btn ghost sm" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>← Prev</button>
                      <span className="faint" style={{ fontSize: 12.5 }}>Page {curPage} / {pageCount}</span>
                      <button className="btn ghost sm" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>Next →</button>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer */}
          <div className="stack gap16">
            <div className="card pad">
              <div className="row gap8"><span className="ic cyan"><MessageSquare size={16} /></span><h3 style={{ margin: 0 }}>Message</h3></div>
              <p className="muted" style={{ fontSize: 12 }}>Placeholders: {'{{name}}'} {'{{business}}'}. Sends to <b>{selected.size.toLocaleString()}</b> selected recipient(s).</p>
              <textarea className="input mt8" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row between mt8">
                <small className="faint">{text.length} chars · {segments} segment{segments > 1 ? 's' : ''}/recipient</small>
              </div>
              <div className="row gap8 mt16">
                <button className="btn ghost" disabled={sms.isPending || !selected.size} onClick={() => run(true)}><Eye size={15} /> Preview (dry run)</button>
                <button className="btn" disabled={sms.isPending || !config?.smsReady || !selected.size} onClick={() => { if (confirm(`Send SMS to ${selected.size} recipient(s)?`)) run(false); }}>
                  <Send size={15} /> {config?.smsReady ? 'Send SMS' : 'Telnyx not configured'}
                </button>
              </div>
              {!selected.size && <p className="faint mt8" style={{ fontSize: 12 }}>Select recipients from the list to enable sending.</p>}
            </div>

            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Result</h3>
              {!result ? <p className="muted">No send yet. Preview to see who would receive it.</p> : (
                <div className="log">
                  {(result.dryRun ? `DRY RUN — ${result.total} recipient(s), nothing sent:` : `SENT ${result.sent}/${result.total}:`) + '\n'}
                  {result.results.map((r: any, i: number) => `  ${String(r.status).padEnd(9)} ${r.to}${r.error ? ' — ' + r.error : ''}`).join('\n')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

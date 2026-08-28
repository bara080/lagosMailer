'use client';
import { useMemo, useState } from 'react';
import { MessageSquare, Send, Eye, Phone } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { TableSkeleton, EmptyState } from '@/components/ui';
import { useConfig, useLeads, useSendSms } from '@/lib/hooks';

const SEG = 160; // SMS segment length (GSM-7)

export default function SmsPage() {
  const { data: config } = useConfig();
  const { data, isLoading } = useLeads({ stage: 'all' });
  const sms = useSendSms();

  const withPhone = useMemo(() => (data?.leads ?? []).filter((l) => l.phone && l.stage !== 'unsub'), [data]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [text, setText] = useState('Hi {{name}}, a quick note from our team about {{business}}.');
  const [result, setResult] = useState<any>(null);

  const recipients = selected.size ? withPhone.filter((l) => selected.has(l.id)) : withPhone;
  const segments = Math.max(1, Math.ceil(text.length / SEG));

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function run(dryRun: boolean) {
    const ids = recipients.map((l) => l.id);
    setResult(null);
    const out = await sms.mutateAsync({ ids, text, dryRun });
    setResult(out);
  }

  return (
    <>
      <Topbar title="SMS" subtitle="Bulk SMS via Telnyx"
        actions={<span className={`badge ${config?.smsReady ? 'completed' : 'scheduled'}`}>{config?.smsReady ? `Telnyx: ${config?.smsFrom || 'ready'}` : 'Telnyx: not configured'}</span>} />
      <div className="page grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        {/* Recipients */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-h">
            <h3>Recipients <span className="muted" style={{ fontWeight: 400 }}>· {recipients.length} with a phone number</span></h3>
            <div className="row gap8">
              <button className="btn ghost sm" onClick={() => setSelected(new Set(withPhone.map((l) => l.id)))}>Select all</button>
              <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
          {isLoading ? <TableSkeleton rows={6} cols={3} /> :
            withPhone.length === 0 ? <EmptyState title="No leads with phone numbers" hint="Add phone numbers to leads to send SMS." /> : (
            <table className="tbl">
              <thead><tr><th style={{ width: 34 }} /><th>Lead</th><th>Phone</th><th>Stage</th></tr></thead>
              <tbody>
                {withPhone.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td><b>{l.business || l.name || '—'}</b></td>
                    <td className="muted"><Phone size={12} /> {l.phone}</td>
                    <td><span className={`badge ${l.stage}`}>{l.stage}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Composer */}
        <div className="stack gap16">
          <div className="card pad">
            <div className="row gap8"><span className="ic cyan"><MessageSquare size={16} /></span><h3 style={{ margin: 0 }}>Message</h3></div>
            <p className="muted" style={{ fontSize: 12 }}>Placeholders: {'{{name}}'} {'{{business}}'}. Sends to {selected.size ? `${selected.size} selected` : 'all'} recipient(s).</p>
            <textarea className="input mt8" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row between mt8">
              <small className="faint">{text.length} chars · {segments} segment{segments > 1 ? 's' : ''}/recipient</small>
            </div>
            <div className="row gap8 mt16">
              <button className="btn ghost" disabled={sms.isPending} onClick={() => run(true)}><Eye size={15} /> Preview (dry run)</button>
              <button className="btn" disabled={sms.isPending || !config?.smsReady} onClick={() => { if (confirm(`Send SMS to ${recipients.length} recipient(s)?`)) run(false); }}>
                <Send size={15} /> {config?.smsReady ? 'Send SMS' : 'Telnyx not configured'}
              </button>
            </div>
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
    </>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileText, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { Modal } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/lib/hooks';
import { plainToHtml } from '@/lib/markdown';
import type { Template } from '@/lib/api';

// Reusable email copy, stored per company (Native125th ≠ LagosTSQ) and served via
// React Query so edits show immediately and switching company refetches the set.
// Bodies use the friendly [First name] tokens Compose converts to {{…}} on send.
export default function TemplatesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { data, isLoading } = useTemplates();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const del = useDeleteTemplate();
  const templates = data?.templates ?? [];

  const [editing, setEditing] = useState<Template | null>(null); // row being edited
  const [creating, setCreating] = useState(false);

  // Stash the picked template so Compose can prefill it (multi-line body → sessionStorage).
  function useInCampaign(t: Template) {
    try { sessionStorage.setItem('composeTemplate', JSON.stringify({ name: t.name, subject: t.subject, message: t.body })); } catch {}
    router.push('/compose?template=1');
  }

  return (
    <>
      <Topbar title="Templates" subtitle="Reusable email copy for your campaigns" />
      <div className="page">
        <div className="row between" style={{ marginBottom: 16 }}>
          <span className="faint" style={{ fontSize: 13 }}>{templates.length} template{templates.length === 1 ? '' : 's'} for this company</span>
          <button className="btn" onClick={() => setCreating(true)}><Plus size={15} /> New template</button>
        </div>

        {isLoading ? (
          <p className="faint">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="card pad"><p className="faint" style={{ margin: 0 }}>No templates yet. Create one to reuse across campaigns.</p></div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {templates.map((t) => (
              <div className="card pad" key={t.id}>
                <div className="row between">
                  <div className="row gap8"><span className="ic blue"><FileText size={16} /></span><b>{t.name}</b></div>
                  <div className="row gap8">
                    <button className="icon-btn sm" title="Edit" onClick={() => setEditing(t)}><Pencil size={14} /></button>
                    <button className="icon-btn sm" title="Delete" onClick={async () => {
                      if (await confirm({ title: 'Delete template?', message: <>Delete <b>“{t.name}”</b>? This can’t be undone.</>, confirmLabel: 'Delete', danger: true })) del.mutate(t.id);
                    }}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="muted mt12" style={{ fontSize: 13, fontWeight: 600 }}>{t.subject}</div>
                {/* Render the friendly markdown (links + line breaks) — same renderer as Compose. */}
                <div className="muted tpl-body" style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: plainToHtml(t.body) }} />
                <button className="btn ghost sm mt12" onClick={() => useInCampaign(t)}>Use in campaign <ArrowRight size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <TemplateEditor
          initial={editing}
          busy={create.isPending || update.isPending}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (vals) => {
            if (editing) await update.mutateAsync({ id: editing.id, patch: vals });
            else await create.mutateAsync(vals);
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </>
  );
}

// Create/edit form. Same shape for both — `initial` null means "new".
function TemplateEditor({ initial, busy, onClose, onSave }: {
  initial: Template | null; busy: boolean; onClose: () => void; onSave: (v: { name: string; subject: string; body: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const valid = name.trim() && subject.trim() && body.trim();
  return (
    <Modal
      title={initial ? 'Edit template' : 'New template'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!valid || busy} onClick={() => valid && onSave({ name: name.trim(), subject: subject.trim(), body })}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create template'}
          </button>
        </>
      }
    >
      <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Open Mic Night" /></label>
      <label className="field mt12"><span>Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="You're invited…" /></label>
      <label className="field mt12"><span>Message <small className="faint">(use [First name], [Business], [Category])</small></span>
        <textarea className="input" style={{ minHeight: 180, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi [First name], …" />
      </label>
    </Modal>
  );
}

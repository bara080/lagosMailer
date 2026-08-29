'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Centered, theme-matched confirmation modal — replaces window.confirm/prompt.
// When `requireText` is set, the confirm button stays disabled until the user
// types that exact value (used to gate large sends).
export default function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', danger = false, requireText, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const blocked = !!requireText && typed.trim() !== requireText;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="modal-title">{title}</h3>
        <div className="modal-msg">{message}</div>
        {requireText && (
          <label className="field mt16"><span>Type <b>{requireText}</b> to confirm</span>
            <input className="input" value={typed} autoFocus onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !blocked) onConfirm(); }} placeholder={requireText} />
          </label>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : ''}`} disabled={blocked} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

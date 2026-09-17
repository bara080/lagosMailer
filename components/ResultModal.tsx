'use client';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import type { ReactNode } from 'react';

// Reusable confirmation / affirmation modal (result feedback — NOT a yes/no prompt;
// for that use ConfirmProvider's useConfirm). Self-contained inline styles so it
// renders correctly on both the app (class-themed) and standalone public pages
// (e.g. /optin) with no provider or CSS dependency.
export type ResultVariant = 'success' | 'info' | 'error';

const ACCENT: Record<ResultVariant, string> = {
  success: '#2fd9c9',
  info: '#d9b26a',
  error: '#e0655a',
};
const ICON = { success: CheckCircle2, info: Info, error: AlertTriangle };

export default function ResultModal({
  open, variant = 'success', title, message, actionLabel = 'Done', onClose,
}: {
  open: boolean;
  variant?: ResultVariant;
  title: string;
  message?: ReactNode;
  actionLabel?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  const accent = ACCENT[variant];
  const Icon = ICON[variant];
  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, background: '#241a2e', border: '1px solid #3a2c47',
          borderRadius: 16, padding: 26, color: '#ece7f1', fontFamily: 'system-ui, sans-serif',
          position: 'relative', textAlign: 'center',
        }}
      >
        <button
          aria-label="Close" onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: '#8a7ea0', cursor: 'pointer', padding: 4, lineHeight: 0 }}
        >
          <X size={18} />
        </button>
        <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
            <Icon size={28} color={accent} />
          </div>
          <h2 style={{ margin: 0, fontSize: 19, color: '#fff' }}>{title}</h2>
          {message && <div style={{ color: '#b6acc2', fontSize: 14, lineHeight: 1.55 }}>{message}</div>}
          <button
            onClick={onClose}
            style={{ marginTop: 8, padding: '11px 22px', borderRadius: 10, border: 'none', background: accent, color: '#1a1220', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

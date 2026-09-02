'use client';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

// Reusable form modal — the app's real dialog (blurred overlay, rounded card,
// shadow; left-aligned content). Optional `footer` for action buttons.
export function Modal({ title, children, onClose, width = 460, footer }: {
  title: ReactNode; children: ReactNode; onClose: () => void; width?: number; footer?: ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ w, h, style }: { w?: number | string; h?: number | string; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ width: w ?? '100%', height: h ?? 12, ...style }} />;
}

export function MetricCardSkeleton() {
  return (
    <div className="metric">
      <div className="top"><Skeleton w={34} h={34} style={{ borderRadius: 9 }} /><Skeleton w={80} /></div>
      <Skeleton w={70} h={26} />
      <div className="mt8"><Skeleton w={50} h={11} /></div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <table className="tbl">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} className="sk-row">
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}><Skeleton w={c === 0 ? '70%' : '55%'} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MetricCard({ icon, tone, label, value, delta }: {
  icon: ReactNode; tone: string; label: string; value: ReactNode;
  delta?: { dir: 'up' | 'down' | 'flat'; text: string } | null;
}) {
  return (
    <div className="metric">
      <div className="top">
        <span className={`ic ${tone}`}>{icon}</span>
        <span className="lbl">{label}</span>
      </div>
      <div className="val">{value}</div>
      {delta && <div className={`delta ${delta.dir}`}>{delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : ''} {delta.text}</div>}
    </div>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return <span className={`badge ${stage}`}>{stage[0].toUpperCase() + stage.slice(1)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status.toUpperCase()}</span>;
}

// Reusable horizontal stepper (1..N). `current` is a 0-based index; steps before
// it render "done" (green), the current one "active" (accent), the rest muted.
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const pct = steps.length > 1 ? Math.min(1, current / (steps.length - 1)) * 100 : 0;
  return (
    <div className="stepper">
      <div className="stepper-track"><span style={{ width: `${pct}%` }} /></div>
      <div className="stepper-steps">
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : '';
          return (
            <div key={label} className={`stepper-step ${state}`}>
              <span className="stepper-num">{i + 1}</span>
              <span className="stepper-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="muted mt8">{hint}</div>}
    </div>
  );
}

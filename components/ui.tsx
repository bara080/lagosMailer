'use client';
import type { ReactNode } from 'react';

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

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="muted mt8">{hint}</div>}
    </div>
  );
}

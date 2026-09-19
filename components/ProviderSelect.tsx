'use client';
import type { ChangeEventHandler } from 'react';

// Single source of truth for the email delivery providers shown in the UI.
// `smtp` sends through whatever the company's SMTP_* env points at — currently
// Amazon SES (email-smtp.<region>.amazonaws.com). To add or rename a provider,
// edit THIS list only; the Compose (Delivery) and Runs (launch/edit) dropdowns
// and the "via <provider>" labels all derive from it.
export const EMAIL_PROVIDERS = [
  { value: 'smtp', label: 'Amazon SES (SMTP)' },
  { value: 'resend', label: 'Resend' },
] as const;

export type ProviderValue = (typeof EMAIL_PROVIDERS)[number]['value'];

// Human label for a provider value (defaults to the first provider if unknown).
export function providerLabel(value?: string): string {
  return EMAIL_PROVIDERS.find((p) => p.value === value)?.label ?? EMAIL_PROVIDERS[0].label;
}

// Reusable provider <select>. Mirrors a native select's API so it drops straight
// into existing handlers, e.g. onChange={set('provider')} or
// onChange={(e) => setProvider(e.target.value)}.
export function ProviderSelect({
  value,
  onChange,
  className = 'input',
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  className?: string;
}) {
  return (
    <select className={className} value={value} onChange={onChange}>
      {EMAIL_PROVIDERS.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  );
}

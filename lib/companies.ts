// Companies (tenants). Each has fully separate leads/campaigns data, scoped
// server-side by the `x-company` header (see lib/api.ts + the API routes).
export const COMPANIES = [
  { id: 'LagosTSQ', name: 'LagosTSQ' },
  { id: 'Native125th', name: 'Native125th' },
] as const;

export const DEFAULT_COMPANY = COMPANIES[0].id;

const KEY = 'lm_company';

export function getCompany(): string {
  if (typeof window === 'undefined') return DEFAULT_COMPANY;
  return localStorage.getItem(KEY) || DEFAULT_COMPANY;
}

export function setCompany(id: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, id);
}

// Typed fetch client for the CRM API (consumed by TanStack Query hooks).

export type Stage = 'new' | 'contacted' | 'replied' | 'qualified' | 'won' | 'unsub';

export interface Lead {
  id: number;
  business: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  website: string;
  borough: string;
  category: string;
  source: string;
  stage: Stage;
  subject: string;
  notes: string;
  contacted_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export type Counts = Record<string, number>;

export interface Campaign {
  id: number;
  name: string;
  description: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo: string;
  audience: AudienceFilter;
  status: 'draft' | 'sending' | 'completed' | 'paused' | 'scheduled';
  recipients: number;
  sent: number;
  delivered: number;
  opens: number;
  replied: number;
  bounces: number;
  created_at: string;
  sent_at: string | null;
  scheduled_at: string | null;
}

export interface AudienceFilter {
  stage?: string;
  category?: string;
  source?: string;
  q?: string;
  ids?: number[];
}

export interface Stats {
  metrics: {
    totalLeads: number; newLeads: number; newThisWeek: number;
    emailsSent: number; sentThisWeek: number; delivered: number; opens: number;
    replies: number; qualified: number; won: number; bounces: number; unsubscribes: number;
  };
  series: { key: string; label: string; sent: number; replies: number }[];
  stageDonut: { key: string; label: string; value: number }[];
  campaigns: Campaign[];
  segments: { name: string; recipients: number; sent: number; replied: number }[];
  activity: { at: string; type: string; text: string }[];
  lastBlast: { sent: number; total: number; failed: number; label: string; at: string } | null;
}

export interface Config { smtpReady: boolean; from: string; stages: Stage[]; }

import { getCompany } from './companies';

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-company': getCompany(), ...(opts?.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data && data.error) || `request failed: ${r.status}`);
  return data as T;
}

export interface Me { user: { _id: string; email: string; displayName: string; role: string } | null; }

export const api = {
  me: () => req<Me>('/api/auth/me'),
  config: () => req<Config>('/api/config'),
  stats: () => req<Stats>('/api/stats'),
  leads: (params: { stage?: string; q?: string } = {}) => {
    const s = new URLSearchParams();
    if (params.stage && params.stage !== 'all') s.set('stage', params.stage);
    if (params.q) s.set('q', params.q);
    return req<{ leads: Lead[]; counts: Counts }>(`/api/leads?${s}`);
  },
  addLead: (body: Partial<Lead>) => req<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(body) }),
  updateLead: (id: number, body: Partial<Lead>) => req<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLead: (id: number) => req<{ ok: boolean }>(`/api/leads/${id}`, { method: 'DELETE' }),
  importCsv: (csv: string) => req<{ added: number }>('/api/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  campaigns: () => req<{ campaigns: Campaign[]; counts: Counts }>('/api/campaigns'),
  campaign: (id: number) => req<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (body: Partial<Campaign>) => req<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id: number, body: Partial<Campaign>) => req<Campaign>(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  sendCampaign: (id: number, dryRun: boolean) =>
    req<{ sent: number; total: number; dryRun: boolean; results: any[] }>(`/api/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify({ dryRun }) }),
  blast: (body: { ids: number[]; subject: string; html: string; text: string; dryRun: boolean }) =>
    req<{ sent: number; total: number; dryRun: boolean; results: any[] }>('/api/blast', { method: 'POST', body: JSON.stringify(body) }),
};

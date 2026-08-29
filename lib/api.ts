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

// An uploaded asset (bytes in Vercel Blob, metadata in Supabase).
export interface Asset { id: number; url: string; name: string; contentType: string; size: number; at: string; }
// An asset attached to a campaign. `inline` images render in the body; others
// are sent as file attachments.
export interface Attachment { url: string; name: string; contentType: string; size: number; inline: boolean; }

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
  attachments?: Attachment[];
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

// Rich per-company email signature, auto-appended to every send.
export interface Signature {
  enabled: boolean;
  businessName: string;
  tagline: string;
  address: string;
  phone: string;
  website: string;
  logoUrl: string;
  socials: { instagram?: string; tiktok?: string; facebook?: string; x?: string };
}

export interface Config { smtpReady: boolean; from: string; smsReady: boolean; smsFrom: string; sheetReady: boolean; sheetHasCreds: boolean; sheetUrl: string; company: string; stages: Stage[]; signature: Signature | null; }

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
  syncSheet: () => req<{ added: number; total: number }>('/api/sheets/sync', { method: 'POST' }),
  setSheet: (url: string, range?: string) => req<{ sheetId: string }>('/api/sheets/config', { method: 'POST', body: JSON.stringify({ url, range }) }),
  campaigns: () => req<{ campaigns: Campaign[]; counts: Counts }>('/api/campaigns'),
  campaign: (id: number) => req<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (body: Partial<Campaign>) => req<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id: number, body: Partial<Campaign>) => req<Campaign>(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Sends ONE batch and returns progress. Use sendCampaignAll() to run a whole
  // campaign (it loops this until `done`).
  sendCampaignBatch: (id: number, dryRun: boolean, size?: number) =>
    req<SendProgress>(`/api/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify({ dryRun, size }) }),
  controlCampaign: (id: number, action: 'pause' | 'stop' | 'resume') =>
    req<{ ok: boolean; action: string }>(`/api/campaigns/${id}/control`, { method: 'POST', body: JSON.stringify({ action }) }),
  testSend: (body: { subject: string; html: string; text: string; attachments?: Attachment[] }) =>
    req<{ sent: number; to: string }>('/api/campaigns/test', { method: 'POST', body: JSON.stringify(body) }),
  listAssets: () => req<{ assets: Asset[]; blobReady: boolean }>('/api/assets'),
  uploadAsset: async (file: File): Promise<{ asset: Asset }> => {
    const fd = new FormData();
    fd.append('file', file);
    // No JSON Content-Type here — the browser sets the multipart boundary.
    const r = await fetch('/api/assets', { method: 'POST', headers: { 'x-company': getCompany() }, body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || `upload failed: ${r.status}`);
    return d;
  },
  deleteAsset: (id: number) => req<{ ok: boolean }>(`/api/assets?id=${id}`, { method: 'DELETE' }),
  getSettings: () => req<{ settings: { signature?: Signature } }>('/api/settings'),
  setSettings: (body: { signature?: Signature | null }) =>
    req<{ ok: boolean; settings: { signature?: Signature } }>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),
  blast: (body: { ids: number[]; subject: string; html: string; text: string; dryRun: boolean }) =>
    req<{ sent: number; total: number; dryRun: boolean; results: any[] }>('/api/blast', { method: 'POST', body: JSON.stringify(body) }),
  sms: (body: { ids: number[]; text: string; dryRun: boolean }) =>
    req<{ sent: number; total: number; dryRun: boolean; smsReady: boolean; results: any[] }>('/api/sms', { method: 'POST', body: JSON.stringify(body) }),
};

// Progress from one send batch.
export interface SendProgress {
  done: boolean; dryRun: boolean; sent: number; sentNow: number;
  total: number; remaining: number; smtpReady: boolean; results: any[];
}

// Run a whole campaign by looping batches until done, reporting progress after
// each batch. A dry run returns in a single call. Large audiences are delivered
// across several short requests so none of them times out.
export async function sendCampaignAll(
  id: number,
  opts: { dryRun: boolean; onProgress?: (p: SendProgress) => void } = { dryRun: false },
): Promise<SendProgress> {
  let last: SendProgress;
  do {
    last = await api.sendCampaignBatch(id, opts.dryRun, opts.dryRun ? undefined : undefined);
    opts.onProgress?.(last);
    if (opts.dryRun) break;
  } while (!last.done);
  return last;
}

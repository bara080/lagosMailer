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
  fromAddress: string;
  replyTo: string;
  audience: AudienceFilter;
  status: 'draft' | 'sending' | 'completed' | 'paused' | 'scheduled' | 'stopped';
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
  emails?: string[];     // custom explicit recipient list (for testing)
  limit?: number;        // cap the audience to the first N (safe batch)
  skipEmailed?: boolean; // exclude leads already emailed (contacted_at) — rolling batches
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

export interface Config { smtpReady: boolean; from: string; senders: string[]; emailProvider: 'smtp' | 'resend'; mailReady: boolean; resendReady: boolean; smsReady: boolean; smsFrom: string; sheetReady: boolean; sheetHasCreds: boolean; sheetUrl: string; company: string; stages: Stage[]; signature: Signature | null; dailyCap: number; sentToday: number; }

// ── Campaign job engine (relational; see src/engine.js) ──────────────────────
export interface EngineCampaign { id: string; company: string; name: string; status: string; current_version_id: string | null; created_at: string; updated_at: string; }
export interface Template { id: number; name: string; subject: string; body: string; created_at?: string; }
export interface EngineRun {
  id: string; campaign_id: string; campaign_version_id: string; status: string;
  audience_mode: string; audience_filter: any; duplicate_policy: string; source_run_id: string | null;
  audience_count: number; dispatch_chunk_size: number; current_stage: number; created_at: string; started_at: string | null; completed_at: string | null;
  progress?: { total: number; accepted: number; failed: number; pending: number; suppressed: number };
}
export interface RunProgress { total: number; pending: number; sending: number; accepted: number; delivered: number; bounced: number; complained: number; failed: number; suppressed: number; cancelled: number; }
// Note: `delivered`/`bounced` come from webhook timestamps (delivery signal),
// separate from the send `status` — so delivered ≤ accepted.
export interface EngineEvent { id: number; run_id: string; event_type: string; actor_type: string; data: any; created_at: string; }
export interface RunStage { stage: number; label: string; total: number; accepted: number; failed: number; pending: number; suppressed: number; status: 'complete' | 'running' | 'ready' | 'waiting'; }
export interface EngineRecipient { id: string; normalized_email: string; status: string; stage_number: number; attempt_count: number; provider: string | null; provider_message_id: string | null; last_error_message: string | null; accepted_at: string | null; }
export interface EngineQuota { accepted: number; reserved: number; limit: number; }
export interface EngineNotification { id: number; type: string; run_id: string | null; run_status: string | null; campaign: string; data: any; created_at: string; actionable: boolean; }
export interface NewRunBody { versionId?: string; audienceMode: string; audienceFilter?: any; duplicatePolicy?: string; dispatchChunkSize?: number; sourceRunId?: string; stagePlan?: { label?: string; limit: number | null }[]; }

import { getCompany } from './companies';

// Downscale/re-encode large images in the browser BEFORE upload so they fit the
// serverless request-body limit (~4.5 MB) and are email-friendly. Non-images and
// formats the browser can't decode (e.g. TIFF) pass through untouched.
async function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (typeof document === 'undefined') return file;
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file;
  if (file.size < 900 * 1024) return file; // already small enough
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch { return file; }
}

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
  leads: (params: { stage?: string; q?: string; page?: number; limit?: number; hasPhone?: boolean } = {}) => {
    const s = new URLSearchParams();
    if (params.stage && params.stage !== 'all') s.set('stage', params.stage);
    if (params.q) s.set('q', params.q);
    if (params.page) s.set('page', String(params.page));
    if (params.limit) s.set('limit', String(params.limit));
    if (params.hasPhone) s.set('hasPhone', '1');
    return req<{ leads: Lead[]; total: number; page: number; limit: number; counts: Counts }>(`/api/leads?${s}`);
  },
  audiencePreview: (f: AudienceFilter) =>
    req<{ emailable: number; remaining: number; sample: Lead | null }>('/api/audience', { method: 'POST', body: JSON.stringify(f) }),
  addLead: (body: Partial<Lead>) => req<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(body) }),
  updateLead: (id: number, body: Partial<Lead>) => req<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLead: (id: number) => req<{ ok: boolean }>(`/api/leads/${id}`, { method: 'DELETE' }),
  importCsv: (csv: string) => req<{ added: number }>('/api/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  // Email list validation (syntax + MX). counts (GET) + validate a batch (POST, loop until done).
  validationCounts: () => req<{ valid: number; invalid: number; risky_relay: number; unchecked: number }>('/api/leads/validate'),
  validateLeads: (limit?: number) => req<{ checked: number; valid: number; invalid: number; risky_relay: number; remaining: number; done: boolean }>('/api/leads/validate', { method: 'POST', body: JSON.stringify({ limit }) }),
  removeInvalidLeads: () => req<{ removed: number }>('/api/leads/validate', { method: 'DELETE' }),
  syncSheet: () => req<{ added: number; total: number }>('/api/sheets/sync', { method: 'POST' }),
  setSheet: (url: string, range?: string) => req<{ sheetId: string }>('/api/sheets/config', { method: 'POST', body: JSON.stringify({ url, range }) }),
  campaigns: () => req<{ campaigns: Campaign[]; counts: Counts }>('/api/campaigns'),
  campaign: (id: number) => req<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (body: Partial<Campaign>) => req<Campaign>('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id: number, body: Partial<Campaign>) => req<Campaign>(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCampaign: (id: number) => req<{ ok: boolean }>(`/api/campaigns/${id}`, { method: 'DELETE' }),
  // Sends ONE batch and returns progress. Use sendCampaignAll() to run a whole
  // campaign (it loops this until `done`).
  sendCampaignBatch: (id: number, dryRun: boolean, size?: number) =>
    req<SendProgress>(`/api/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify({ dryRun, size }) }),
  controlCampaign: (id: number, action: 'pause' | 'stop' | 'resume' | 'resend') =>
    req<{ ok: boolean; action: string }>(`/api/campaigns/${id}/control`, { method: 'POST', body: JSON.stringify({ action }) }),

  // ── Campaign job engine ────────────────────────────────────────────────────
  engineCampaigns: () => req<{ campaigns: EngineCampaign[] }>('/api/engine/campaigns'),
  // Bridge: clone a legacy Compose campaign into an engine campaign (to launch as a run).
  importCampaign: (id: number) => req<{ campaign: EngineCampaign; version: any }>('/api/engine/import-campaign', { method: 'POST', body: JSON.stringify({ id }) }),
  createEngineCampaign: (body: { name: string; subject: string; html: string; text: string; senderKey?: string; providerKey?: string; replyTo?: string; attachments?: Attachment[] }) =>
    req<{ campaign: EngineCampaign; version: any }>('/api/engine/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  engineRuns: (campaignId: string) => req<{ runs: EngineRun[] }>(`/api/engine/campaigns/${campaignId}/runs`),
  createRun: (campaignId: string, body: NewRunBody) =>
    req<{ run: EngineRun; snapshot: { count: number }; first?: { sentNow?: number; done?: boolean } | null; workflowStarted: boolean }>(`/api/engine/campaigns/${campaignId}/runs`, { method: 'POST', body: JSON.stringify(body) }),
  runDetail: (runId: string) => req<{ run: EngineRun; progress: RunProgress; events: EngineEvent[]; stages: RunStage[] }>(`/api/engine/runs/${runId}`),
  runRecipients: (runId: string, params: { page?: number; limit?: number; status?: string } = {}) => {
    const s = new URLSearchParams();
    if (params.page) s.set('page', String(params.page));
    if (params.limit) s.set('limit', String(params.limit));
    if (params.status) s.set('status', params.status);
    return req<{ recipients: EngineRecipient[]; total: number; page: number; limit: number }>(`/api/engine/runs/${runId}/recipients?${s}`);
  },
  engineQuota: () => req<EngineQuota>('/api/engine/quota'),
  notifications: () => req<{ items: EngineNotification[]; unread: number }>('/api/engine/notifications'),
  controlRun: (runId: string, action: 'pause' | 'resume' | 'stop' | 'continue') =>
    req<{ ok: boolean; status: string }>(`/api/engine/runs/${runId}/control`, { method: 'POST', body: JSON.stringify({ action }) }),
  deleteRun: (runId: string) => req<{ ok: boolean }>(`/api/engine/runs/${runId}`, { method: 'DELETE' }),
  deleteEngineCampaign: (campaignId: string) => req<{ ok: boolean }>(`/api/engine/campaigns/${campaignId}`, { method: 'DELETE' }),

  // ── Templates (per-company reusable copy) ──────────────────────────────────
  templates: () => req<{ templates: Template[] }>('/api/templates'),
  createTemplate: (body: { name: string; subject: string; body: string }) => req<Template>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),
  updateTemplate: (id: number, body: Partial<Template>) => req<Template>(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTemplate: (id: number) => req<{ ok: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),
  testSend: (body: { subject: string; html: string; text: string; attachments?: Attachment[] }) =>
    req<{ sent: number; to: string }>('/api/campaigns/test', { method: 'POST', body: JSON.stringify(body) }),
  listAssets: () => req<{ assets: Asset[]; blobReady: boolean }>('/api/assets'),
  // Register an already-hosted file as an asset (no upload). Works without Blob.
  registerAssetUrl: (body: { url: string; name?: string }) =>
    req<{ asset: Asset }>('/api/assets', { method: 'POST', body: JSON.stringify(body) }),
  // Uploads DIRECTLY to Supabase Storage via a signed URL (bypasses the ~4.5MB
  // serverless limit). Images are still compressed for email-friendliness.
  uploadAsset: async (file: File): Promise<{ asset: Asset }> => {
    const prepared = await compressImageFile(file);
    if (prepared.size > 48 * 1024 * 1024) {
      throw new Error(`"${file.name}" is ${(prepared.size / 1024 / 1024).toFixed(1)} MB — over the 50 MB limit.`);
    }
    // 1) get a signed upload URL from the server
    const sign = await req<{ signedUrl: string; path: string; url: string }>('/api/assets/sign', {
      method: 'POST', body: JSON.stringify({ filename: prepared.name, contentType: prepared.type }),
    });
    // 2) upload the file straight to storage
    const put = await fetch(sign.signedUrl, { method: 'PUT', body: prepared, headers: { 'content-type': prepared.type || 'application/octet-stream' } });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    // 3) register the finished asset
    return req<{ asset: Asset }>('/api/assets', {
      method: 'POST',
      body: JSON.stringify({ url: sign.url, name: prepared.name, contentType: prepared.type || 'application/octet-stream', size: prepared.size, path: sign.path, backend: 'supabase' }),
    });
  },
  deleteAsset: (id: number) => req<{ ok: boolean }>(`/api/assets?id=${id}`, { method: 'DELETE' }),
  getSettings: () => req<{ settings: { signature?: Signature } }>('/api/settings'),
  setSettings: (body: { signature?: Signature | null; dailyCap?: number | null }) =>
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

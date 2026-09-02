'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AudienceFilter, type Campaign, type Lead, type SendProgress } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 300_000 });
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000 });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 15_000 });
}

export function useLeads(params: { stage?: string; q?: string; page?: number; limit?: number; hasPhone?: boolean }) {
  return useQuery({ queryKey: ['leads', params], queryFn: () => api.leads(params), placeholderData: (prev) => prev });
}

// Live audience size + sample for Compose (computed DB-side, so it's accurate
// at 63k). Debounce the filter on the caller side if it changes rapidly.
export function useAudiencePreview(f: AudienceFilter, enabled = true) {
  return useQuery({
    queryKey: ['audience', f],
    queryFn: () => api.audiencePreview(f),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useAddLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Lead>) => api.addLead(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Lead> }) => api.updateLead(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteLead(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => api.importCsv(csv),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useSyncSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.syncSheet(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useSetSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, range }: { url: string; range?: string }) => api.setSheet(url, range),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); },
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: api.campaigns,
    staleTime: 0,
    // Live-poll while anything is in flight so SENDING/paused rows never go
    // stale (e.g. a campaign that completes or is stopped elsewhere).
    refetchInterval: (query) => {
      const active = query.state.data?.campaigns?.some((c) => c.status === 'sending' || c.status === 'paused');
      return active ? 3000 : false;
    },
  });
}

export function useCampaign(id: number | null) {
  return useQuery({ queryKey: ['campaign', id], queryFn: () => api.campaign(id as number), enabled: !!id });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Campaign>) => api.createCampaign(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Campaign> }) => api.updateCampaign(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', v.id] });
    },
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    // Kicks ONE batch (starts the send / does the dry-run). Real sends then
    // continue in the background via the cron — no browser loop, so closing the
    // tab can't stall a campaign.
    mutationFn: ({ id, dryRun }: { id: number; dryRun: boolean }) => api.sendCampaignBatch(id, dryRun),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// Pause / stop / resume a campaign. Resume also drains the remaining queue.
export function useControlCampaign() {
  const qc = useQueryClient();
  return useMutation({
    // Pause/stop/resume just set/clear the control flag. Resume flips it back to
    // sending; the cron then drains the remaining queue in the background.
    mutationFn: async ({ id, action }: { id: number; action: 'pause' | 'stop' | 'resume' | 'resend' }) => {
      await api.controlCampaign(id, action);
      return null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// Send one test email to the operator's own inbox (no lead, no audience).
export function useTestSend() {
  return useMutation({ mutationFn: api.testSend });
}

// Per-company asset library (Blob-backed).
export function useAssets() {
  return useQuery({ queryKey: ['assets'], queryFn: api.listAssets });
}
export function useUploadAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadAsset(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}
export function useRegisterAssetUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; name?: string }) => api.registerAssetUrl(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}
export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}

// ── Campaign job engine ──────────────────────────────────────────────────────
export function useEngineCampaigns() {
  return useQuery({ queryKey: ['engine-campaigns'], queryFn: api.engineCampaigns });
}
export function useEngineRuns(campaignId: string | null) {
  return useQuery({
    queryKey: ['engine-runs', campaignId],
    queryFn: () => api.engineRuns(campaignId as string),
    enabled: !!campaignId,
    // Poll while any run is in flight so statuses stay fresh.
    refetchInterval: (q) => (q.state.data?.runs?.some((r) => ['queued', 'running', 'paused', 'stopping'].includes(r.status)) ? 3000 : false),
  });
}
export function useRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ['engine-run', runId],
    queryFn: () => api.runDetail(runId as string),
    enabled: !!runId,
    // Live cadence: poll while the run is active.
    refetchInterval: (q) => (['queued', 'running', 'paused', 'stopping'].includes(q.state.data?.run?.status || '') ? 2000 : false),
  });
}
export function useRunRecipients(runId: string | null, params: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['engine-recipients', runId, params],
    queryFn: () => api.runRecipients(runId as string, params),
    enabled: !!runId,
    placeholderData: (prev) => prev,
  });
}
export function useEngineQuota() {
  return useQuery({ queryKey: ['engine-quota'], queryFn: api.engineQuota, refetchInterval: 5000 });
}
export function useImportCampaign() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => api.importCampaign(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['engine-campaigns'] }) });
}
export function useCreateEngineCampaign() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createEngineCampaign, onSuccess: () => qc.invalidateQueries({ queryKey: ['engine-campaigns'] }) });
}
export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, body }: { campaignId: string; body: import('./api').NewRunBody }) => api.createRun(campaignId, body),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['engine-runs', v.campaignId] }); qc.invalidateQueries({ queryKey: ['engine-campaigns'] }); },
  });
}
export function useControlRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'pause' | 'resume' | 'stop' | 'continue' }) => api.controlRun(runId, action),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['engine-run', v.runId] }); qc.invalidateQueries({ queryKey: ['engine-runs'] }); },
  });
}

export function useSetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.setSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useBlast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.blast,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.sms,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, sendCampaignAll, type Campaign, type Lead, type SendProgress } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 300_000 });
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000 });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 15_000 });
}

export function useLeads(params: { stage?: string; q?: string }) {
  return useQuery({ queryKey: ['leads', params], queryFn: () => api.leads(params) });
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
  return useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Campaign>) => api.createCampaign(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dryRun, onProgress }: { id: number; dryRun: boolean; onProgress?: (p: SendProgress) => void }) =>
      sendCampaignAll(id, { dryRun, onProgress }),
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
    mutationFn: async ({ id, action, onProgress }: { id: number; action: 'pause' | 'stop' | 'resume'; onProgress?: (p: SendProgress) => void }) => {
      await api.controlCampaign(id, action);
      if (action === 'resume') return sendCampaignAll(id, { dryRun: false, onProgress });
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

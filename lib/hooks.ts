'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Campaign, type Lead } from './api';

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
    mutationFn: ({ id, dryRun }: { id: number; dryRun: boolean }) => api.sendCampaign(id, dryRun),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
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

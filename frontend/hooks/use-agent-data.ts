'use client';
// React Query hooks over the canonical AgentRepository — the CRUD-data seam for the
// Agent Model, parallel to hooks/use-platform-data.ts wrapping lib/mock-api.ts. Every
// hook here reaches the same shared application-level repository instance
// (getDefaultAgentRepository, lib/agent-repository.ts) rather than constructing its
// own — see documentation/agent-model-implementation-plan.md Phase 3A.
//
// Scope: identity/listing/detail and draft editing only (Phase 3A). No publish/version-
// history hooks yet — nothing in this phase needs them (VersionsPanel and the publish
// action are still out of scope; see agent-model-implementation-plan.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDefaultAgentRepository, type AgentVersionConfigPatch } from '@/lib/agent-repository';

const repository = getDefaultAgentRepository();

export const agentQueryKeys = {
  list: ['agents-canonical'] as const,
  agent: (agentId: string) => ['agents-canonical', agentId] as const,
  draft: (agentId: string) => ['agents-canonical', agentId, 'draft'] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentQueryKeys.list,
    queryFn: () => repository.listAgents(),
    staleTime: 30_000,
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: agentQueryKeys.agent(agentId),
    queryFn: () => repository.getAgent(agentId),
    staleTime: 30_000,
  });
}

/** Enabled only once the Agent itself is confirmed to exist — getDraft throws otherwise. */
export function useAgentDraft(agentId: string, enabled = true) {
  return useQuery({
    queryKey: agentQueryKeys.draft(agentId),
    queryFn: () => repository.getDraft(agentId),
    staleTime: 0,
    enabled,
  });
}

export function useUpdateAgentDraft(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AgentVersionConfigPatch) => repository.updateDraft(agentId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(agentQueryKeys.draft(agentId), updated);
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => repository.createAgent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.list });
    },
  });
}

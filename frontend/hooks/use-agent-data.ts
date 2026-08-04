'use client';
// React Query hooks over the canonical AgentRepository — the CRUD-data seam for the
// Agent Model, parallel to hooks/use-platform-data.ts wrapping lib/mock-api.ts. Every
// hook here reaches the same shared application-level repository instance
// (getDefaultAgentRepository, lib/agent-repository.ts) rather than constructing its
// own — see documentation/agent-model-implementation-plan.md Phase 3A.
//
// Phase 3A scope was identity/listing/detail and draft editing only. Phase 3B
// (documentation/agent-model-implementation-plan.md) adds publish/version-history/
// rollback hooks — Prompt Studio, Versions, and Agent Testing all need them now.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDefaultAgentRepository, type AgentVersionConfigPatch } from '@/lib/agent-repository';
import { publishAgentDraft, rollbackDraftToVersion } from '@/lib/agent-publish';

const repository = getDefaultAgentRepository();

export const agentQueryKeys = {
  list: ['agents-canonical'] as const,
  agent: (agentId: string) => ['agents-canonical', agentId] as const,
  draft: (agentId: string) => ['agents-canonical', agentId, 'draft'] as const,
  versions: (agentId: string) => ['agents-canonical', agentId, 'versions'] as const,
  publishedVersion: (agentId: string) =>
    ['agents-canonical', agentId, 'published-version'] as const,
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

/** Published versions only, newest first — real AgentVersion history, not a fixture. */
export function useAgentVersions(agentId: string) {
  return useQuery({
    queryKey: agentQueryKeys.versions(agentId),
    queryFn: () => repository.listVersions(agentId),
    staleTime: 0,
  });
}

/**
 * The version a runtime would pin right now, or `null` if the agent has never been
 * published. Used by Agent Testing to explicitly resolve — and gate on — the same
 * published AgentVersion the runtime itself pins at session start (Phase 2), instead of
 * silently assuming one exists.
 */
export function useAgentPublishedVersion(agentId: string) {
  return useQuery({
    queryKey: agentQueryKeys.publishedVersion(agentId),
    queryFn: () => repository.getPublishedVersion(agentId),
    staleTime: 0,
  });
}

export function usePublishAgent(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => publishAgentDraft(repository, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.agent(agentId) });
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.versions(agentId) });
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.publishedVersion(agentId) });
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.list });
    },
  });
}

/**
 * Copies a selected immutable published version into the editable draft — the version
 * itself is never mutated, and a later explicit publish is required to turn the rolled-
 * back draft into a new version of its own. See agent-model-implementation-plan.md
 * Phase 3B requirement 6.
 */
export function useRollbackToVersion(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => rollbackDraftToVersion(repository, agentId, versionId),
    onSuccess: (updated) => {
      queryClient.setQueryData(agentQueryKeys.draft(agentId), updated);
    },
  });
}

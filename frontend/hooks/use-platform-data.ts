'use client';
import { useQuery } from '@tanstack/react-query';
import { mockApi } from '@/lib/mock-api';

export const platformQueryKeys = { dashboard: ['dashboard'] as const, agents: ['agents'] as const, knowledgeSources: ['knowledge-sources'] as const };
export function useDashboard() { return useQuery({ queryKey: platformQueryKeys.dashboard, queryFn: mockApi.getDashboard, staleTime: 30_000 }); }
export function useAgents() { return useQuery({ queryKey: platformQueryKeys.agents, queryFn: mockApi.listAgents, staleTime: 30_000 }); }
export function useKnowledgeSources() { return useQuery({ queryKey: platformQueryKeys.knowledgeSources, queryFn: mockApi.listKnowledgeSources, staleTime: 30_000 }); }

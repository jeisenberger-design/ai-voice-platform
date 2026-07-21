'use client';
import { useQuery } from '@tanstack/react-query';
import { mockApi } from '@/lib/mock-api';

export const platformQueryKeys = { dashboard: ['dashboard'] as const, agents: ['agents'] as const, knowledgeSources: ['knowledge-sources'] as const };
export function useDashboard() { return useQuery({ queryKey: platformQueryKeys.dashboard, queryFn: mockApi.getDashboard, staleTime: 30_000 }); }
export function useAgents() { return useQuery({ queryKey: platformQueryKeys.agents, queryFn: mockApi.listAgents, staleTime: 30_000 }); }
export function useKnowledgeSources() { return useQuery({ queryKey: platformQueryKeys.knowledgeSources, queryFn: mockApi.listKnowledgeSources, staleTime: 30_000 }); }
export function useCalls() { return useQuery({ queryKey: ['calls'], queryFn: mockApi.listCalls, staleTime: 30_000 }); }
export function useCall(id:string) { return useQuery({ queryKey: ['calls',id], queryFn: ()=>mockApi.getCall(id), staleTime: 30_000 }); }
export function useCallPerformance() { return useQuery({ queryKey: ['calls','performance'], queryFn: mockApi.getCallPerformance, staleTime: 30_000 }); }
export function useTools() { return useQuery({ queryKey: ['tools'], queryFn: mockApi.listTools, staleTime: 30_000 }); }
export function useTool(id:string) { return useQuery({ queryKey: ['tools',id], queryFn: ()=>mockApi.getTool(id), staleTime: 30_000 }); }
export function useWorkflows() { return useQuery({ queryKey: ['workflows'], queryFn: mockApi.listWorkflows, staleTime: 30_000 }); }
export function useWorkflow(id:string) { return useQuery({ queryKey: ['workflows',id], queryFn: ()=>mockApi.getWorkflow(id), staleTime: 30_000 }); }

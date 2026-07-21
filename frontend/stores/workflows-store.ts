'use client';
import { create } from 'zustand';
import type { WorkflowStatus } from '@/lib/mock-workflows';
export type WorkflowFilters = { query: string; status: WorkflowStatus | '' };
const initial: WorkflowFilters = { query: '', status: '' };
export const useWorkflowsStore = create<{ filters: WorkflowFilters; setFilter: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void; reset: () => void }>((set) => ({ filters: initial, setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })), reset: () => set({ filters: initial }) }));

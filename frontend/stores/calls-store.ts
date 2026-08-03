'use client';
import { create } from 'zustand';
import type { CallOutcome, TransferStatus } from '@/lib/mock-calls';
export type CallFilters = {
  query: string;
  agent: string;
  outcome: CallOutcome | '';
  language: string;
  transfer: TransferStatus | '';
  dateRange: string;
};
const initial: CallFilters = {
  query: '',
  agent: '',
  outcome: '',
  language: '',
  transfer: '',
  dateRange: 'Last 30 days',
};
export const useCallsStore = create<{
  filters: CallFilters;
  setFilter: <K extends keyof CallFilters>(key: K, value: CallFilters[K]) => void;
  reset: () => void;
}>((set) => ({
  filters: initial,
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
  reset: () => set({ filters: initial }),
}));

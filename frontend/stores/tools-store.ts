'use client';
import { create } from 'zustand';
import type { Tool } from '@/lib/mock-tools';
export type ToolFilters = {
  query: string;
  category: Tool['category'] | '';
  status: Tool['status'] | '';
};
const initial: ToolFilters = { query: '', category: '', status: '' };
export const useToolsStore = create<{
  filters: ToolFilters;
  setFilter: <K extends keyof ToolFilters>(key: K, value: ToolFilters[K]) => void;
  reset: () => void;
}>((set) => ({
  filters: initial,
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
  reset: () => set({ filters: initial }),
}));

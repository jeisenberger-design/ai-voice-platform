'use client';
import { create } from 'zustand';
type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  dark: boolean;
  toggleDark: () => void;
};
export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  dark: false,
  toggleDark: () => set((s) => ({ dark: !s.dark })),
}));

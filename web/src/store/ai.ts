import { create } from 'zustand';

interface AIStore {
  isAISidebarOpen: boolean;
  kpiValues: Record<string, string>;
  toggleAISidebar: () => void;
  openAISidebar: () => void;
  closeAISidebar: () => void;
  setKpiValues: (values: Record<string, string>) => void;
}

export const useAIStore = create<AIStore>((set) => ({
  isAISidebarOpen: false,
  kpiValues: {},
  toggleAISidebar: () => set((state) => ({ isAISidebarOpen: !state.isAISidebarOpen })),
  openAISidebar: () => set({ isAISidebarOpen: true }),
  closeAISidebar: () => set({ isAISidebarOpen: false }),
  setKpiValues: (values) => set({ kpiValues: values }),
}));

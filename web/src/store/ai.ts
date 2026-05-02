import { create } from 'zustand';

interface AIStore {
  isAISidebarOpen: boolean;
  sidebarWidth: number;
  kpiValues: Record<string, string>;
  toggleAISidebar: () => void;
  openAISidebar: () => void;
  closeAISidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setKpiValues: (values: Record<string, string>) => void;
}

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 700;
const DEFAULT_SIDEBAR_WIDTH = 380;

export { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH };

export const useAIStore = create<AIStore>((set) => ({
  isAISidebarOpen: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  kpiValues: {},
  toggleAISidebar: () => set((state) => ({ isAISidebarOpen: !state.isAISidebarOpen })),
  openAISidebar: () => set({ isAISidebarOpen: true }),
  closeAISidebar: () => set({ isAISidebarOpen: false }),
  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)) }),
  setKpiValues: (values) => set({ kpiValues: values }),
}));

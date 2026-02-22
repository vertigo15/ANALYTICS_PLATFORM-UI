import { create } from 'zustand';

interface FiltersState {
  from: string;
  to: string;
  organizationId: string | null;
  agentId: string | null;
  setDateRange: (from: string, to: string) => void;
  setOrganizationId: (id: string | null) => void;
  setAgentId: (id: string | null) => void;
}

const getLast30Days = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
};

const defaultDates = getLast30Days();

export const useFiltersStore = create<FiltersState>((set) => ({
  from: defaultDates.from,
  to: defaultDates.to,
  organizationId: null,
  agentId: null,
  setDateRange: (from, to) => set({ from, to }),
  setOrganizationId: (id) => set({ organizationId: id }),
  setAgentId: (id) => set({ agentId: id }),
}));

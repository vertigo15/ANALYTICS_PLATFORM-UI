export const PAGES = {
  COST: '/dashboard/cost',
  AGENTS: '/dashboard/agents',
  ANALYTICS: '/dashboard/analytics',
  USERS: '/dashboard/users',
  DOCUMENTS: '/dashboard/documents',
  OPERATIONS: '/dashboard/operations',
} as const;

export const PAGE_NAMES: Record<string, string> = {
  [PAGES.COST]: 'Cost & Tokens',
  [PAGES.AGENTS]: 'Agent Performance',
  [PAGES.ANALYTICS]: 'Agent Analytics',
  [PAGES.USERS]: 'User Activity',
  [PAGES.DOCUMENTS]: 'Document & RAG Health',
  [PAGES.OPERATIONS]: 'Platform Operations',
};

export const CHART_COLORS = [
  '#2563EB', // blue
  '#7C3AED', // purple
  '#059669', // green
  '#D97706', // amber
  '#DC2626', // red
  '#0891B2', // cyan
  '#9333EA', // violet
  '#65A30D', // lime
];

export const DEFAULT_DATE_RANGE_DAYS = 30;

export const FILTER_DEFAULTS = {
  organizationId: null,
  agentId: null,
};

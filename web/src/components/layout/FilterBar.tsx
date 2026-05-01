'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Calendar } from 'lucide-react';
import { useFiltersStore } from '@/store/filters';
import { fetcher } from '@/lib/fetcher';
import type { ApiResponse, Organisation, Agent } from '@/lib/api';

type DatePreset = '7D' | '30D' | '90D' | 'custom';

const DATE_PRESETS: { value: DatePreset; label: string; days: number }[] = [
  { value: '7D', label: '7D', days: 7 },
  { value: '30D', label: '30D', days: 30 },
  { value: '90D', label: '90D', days: 90 },
];

export default function FilterBar() {
  const { from, to, organizationId, agentId, setDateRange, setOrganizationId, setAgentId } =
    useFiltersStore();

  const [activePreset, setActivePreset] = useState<DatePreset>('30D');
  const [customMode, setCustomMode] = useState(false);

  // Fetch organisations
  const { data: orgsData } = useSWR<ApiResponse<Organisation[]>>(
    '/users/organisations',
    fetcher
  );

  // Fetch agents
  const { data: agentsData } = useSWR<ApiResponse<Agent[]>>('/agents/list', fetcher);

  const handlePresetClick = (preset: DatePreset, days: number) => {
    if (preset === 'custom') {
      setCustomMode(true);
      setActivePreset('custom');
      return;
    }

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    setDateRange(from.toISOString().split('T')[0], to.toISOString().split('T')[0]);
    setActivePreset(preset);
    setCustomMode(false);
  };

  const handleCustomDateChange = (type: 'from' | 'to', value: string) => {
    if (type === 'from') {
      setDateRange(value, to);
    } else {
      setDateRange(from, value);
    }
  };

  return (
    <div className="flex items-center gap-4 mt-4 pb-4 border-b border-border">
      {/* Date Range Picker */}
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-text-secondary" />
        <span className="text-sm text-text-secondary">Date Range:</span>
        <div className="flex gap-1">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetClick(preset.value, preset.days)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activePreset === preset.value && !customMode
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => handlePresetClick('custom', 0)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              customMode
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
            }`}
          >
            Custom
          </button>
        </div>

        {customMode && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={from}
              onChange={(e) => handleCustomDateChange('from', e.target.value)}
              className="px-3 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-text-secondary">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => handleCustomDateChange('to', e.target.value)}
              className="px-3 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Organisation Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">Organisation:</span>
        <select
          value={organizationId || ''}
          onChange={(e) => setOrganizationId(e.target.value || null)}
          className="px-3 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="">All Organisations</option>
          {orgsData?.data.map((org) => (
            <option key={org.organization_id} value={org.organization_id}>
              {org.organization_name || org.organization_id}
            </option>
          ))}
        </select>
      </div>

      {/* Agent Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">Agent:</span>
        <select
          value={agentId || ''}
          onChange={(e) => setAgentId(e.target.value || null)}
          className="px-3 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="">All Agents</option>
          {agentsData?.data.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agent.agent_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

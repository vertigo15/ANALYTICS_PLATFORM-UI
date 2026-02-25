'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Zap, AlertTriangle } from 'lucide-react';
import type { AgentHandoff, ConversationMessage } from '@/lib/api';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  ok: { bg: 'bg-success bg-opacity-10', border: 'border-success', text: 'text-success' },
  slow: { bg: 'bg-warning bg-opacity-10', border: 'border-warning', text: 'text-warning' },
  error: { bg: 'bg-danger bg-opacity-10', border: 'border-danger', text: 'text-danger' },
};

interface OrchestrationFlowProps {
  handoffs: AgentHandoff[];
  messages: ConversationMessage[];
  activeAgentId: string | null;
  onAgentClick: (agentId: string | null) => void;
}

export default function OrchestrationFlow({
  handoffs,
  messages,
  activeAgentId,
  onAgentClick,
}: OrchestrationFlowProps) {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  if (handoffs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Agent Orchestration Flow</h3>
        <p className="text-sm text-text-secondary">No agent orchestration data available for this conversation.</p>
      </div>
    );
  }

  const handleNodeClick = (handoff: AgentHandoff) => {
    const nodeKey = `${handoff.agent_id}-${handoff.order_index}`;
    if (expandedNodeId === nodeKey) {
      setExpandedNodeId(null);
      onAgentClick(null);
    } else {
      setExpandedNodeId(nodeKey);
      onAgentClick(handoff.agent_id);
    }
  };

  const getAgentMessages = (handoff: AgentHandoff) => {
    return messages.filter(
      (m) => m.agent_id === handoff.agent_id && m.role === 'assistant'
    );
  };

  const getAgentPrompts = (handoff: AgentHandoff) => {
    // Get user messages that preceded this agent's responses
    const agentMsgs = getAgentMessages(handoff);
    if (agentMsgs.length === 0) return [];
    const firstAgentTs = new Date(agentMsgs[0].timestamp).getTime();
    return messages.filter(
      (m) => m.role === 'user' && new Date(m.timestamp).getTime() <= firstAgentTs
    ).slice(-2);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Agent Orchestration Flow</h3>

      {/* Flow diagram */}
      <div className="flex items-center gap-0 overflow-x-auto pb-4">
        {handoffs.map((handoff, idx) => {
          const nodeKey = `${handoff.agent_id}-${handoff.order_index}`;
          const isExpanded = expandedNodeId === nodeKey;
          const isActive = activeAgentId === handoff.agent_id;
          const colors = STATUS_COLORS[handoff.status] || STATUS_COLORS.ok;

          return (
            <div key={nodeKey} className="flex items-center shrink-0">
              {/* Node */}
              <button
                onClick={() => handleNodeClick(handoff)}
                className={`
                  relative flex flex-col items-center px-4 py-3 rounded-lg border-2 transition-all
                  min-w-[120px] cursor-pointer
                  ${colors.bg} ${colors.border}
                  ${isActive ? 'ring-2 ring-primary ring-offset-2' : ''}
                  hover:shadow-md
                `}
              >
                <span className="text-sm font-medium text-text-primary truncate max-w-[100px]">
                  {handoff.agent_name}
                </span>
                <div className={`flex items-center gap-1 mt-1 ${colors.text}`}>
                  <Clock size={12} />
                  <span className="text-xs font-medium">
                    {handoff.latency_ms > 1000
                      ? `${(handoff.latency_ms / 1000).toFixed(1)}s`
                      : `${handoff.latency_ms}ms`}
                  </span>
                </div>
                <span className="text-xs text-text-secondary mt-0.5">
                  {handoff.message_count} msg{handoff.message_count !== 1 ? 's' : ''}
                </span>

                {/* Expand indicator */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-text-secondary" />
                  ) : (
                    <ChevronDown size={14} className="text-text-secondary" />
                  )}
                </div>

                {/* Status icon */}
                {handoff.status === 'error' && (
                  <div className="absolute -top-2 -right-2">
                    <AlertTriangle size={14} className="text-danger" />
                  </div>
                )}
                {handoff.status === 'slow' && (
                  <div className="absolute -top-2 -right-2">
                    <Zap size={14} className="text-warning" />
                  </div>
                )}
              </button>

              {/* Arrow between nodes */}
              {idx < handoffs.length - 1 && (
                <div className="flex items-center mx-2 shrink-0">
                  <div className="w-8 h-0.5 bg-slate-300"></div>
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-slate-300"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {expandedNodeId && (() => {
        const [agentId, orderStr] = expandedNodeId.split('-');
        const orderIndex = parseInt(orderStr);
        const handoff = handoffs.find(
          (h) => h.agent_id === agentId && h.order_index === orderIndex
        );
        if (!handoff) return null;

        const agentMsgs = getAgentMessages(handoff);
        const prompts = getAgentPrompts(handoff);
        const colors = STATUS_COLORS[handoff.status] || STATUS_COLORS.ok;

        return (
          <div className={`mt-4 border-2 ${colors.border} rounded-lg p-4 space-y-3 transition-all`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text-primary">
                {handoff.agent_name} — Detail
              </h4>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                {handoff.status.toUpperCase()}
              </span>
            </div>

            {/* Prompts received */}
            {prompts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Prompt Received</p>
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-text-primary max-h-24 overflow-y-auto">
                  {prompts.map((p) => (
                    <p key={p.message_id} className="mb-1 last:mb-0">{p.content || 'No content available'}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Tool calls */}
            {agentMsgs.some((m) => m.has_tool_calls || m.tool_calls) && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Tool Calls</p>
                <div className="bg-slate-50 rounded-lg p-3 text-xs font-mono text-text-primary max-h-24 overflow-y-auto">
                  {agentMsgs
                    .filter((m) => m.has_tool_calls || m.tool_calls)
                    .map((m) => (
                      <p key={m.message_id} className="mb-1 last:mb-0">{m.tool_calls || 'Tool calls used'}</p>
                    ))}
                </div>
              </div>
            )}

            {/* Response returned */}
            {agentMsgs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Response Returned</p>
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-text-primary max-h-32 overflow-y-auto">
                  {agentMsgs.slice(0, 3).map((m) => (
                    <p key={m.message_id} className="mb-1 last:mb-0">
                      {(m.content || 'No content available').slice(0, 300)}
                      {(m.content || '').length > 300 ? '…' : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Latency breakdown */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200">
              <div>
                <p className="text-xs text-text-secondary">Total Latency</p>
                <p className="text-sm font-bold text-text-primary">
                  {handoff.latency_ms > 1000
                    ? `${(handoff.latency_ms / 1000).toFixed(1)}s`
                    : `${handoff.latency_ms}ms`}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Messages</p>
                <p className="text-sm font-bold text-text-primary">{handoff.message_count}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Avg per Message</p>
                <p className="text-sm font-bold text-text-primary">
                  {handoff.message_count > 0
                    ? `${Math.round(handoff.latency_ms / handoff.message_count)}ms`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

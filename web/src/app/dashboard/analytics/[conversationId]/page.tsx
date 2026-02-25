'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Clock, MessageSquare, Mail, Wrench, ThumbsUp } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { formatDateTime } from '@/lib/formatters';
import type { ApiResponse, ConversationDetail } from '@/lib/api';
import StatusBadge from '@/components/dashboard/StatusBadge';
import OrchestrationFlow from '@/components/analytics/OrchestrationFlow';
import TimelineScrubber from '@/components/analytics/TimelineScrubber';
import MessageThread from '@/components/analytics/MessageThread';

function outcomeToStatus(outcome: string): 'success' | 'warning' | 'error' | 'pending' {
  switch (outcome) {
    case 'Completed': return 'success';
    case 'Abandoned': return 'pending';
    default: return 'pending';
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function ConversationDrillDownPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;

  // Cross-layer sync state
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [scrollToMessageIndex, setScrollToMessageIndex] = useState<number | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Fetch conversation detail
  const { data, isLoading, error } = useSWR<ApiResponse<ConversationDetail>>(
    conversationId ? `/analytics/conversations/${conversationId}` : null,
    fetcher
  );

  const conversation = data?.data;

  // Build agent status map from handoffs
  const agentStatusMap = useMemo(() => {
    if (!conversation) return {};
    const map: Record<string, string> = {};
    for (const h of conversation.handoffs) {
      // Use worst status if agent appears multiple times
      if (!map[h.agent_id] || h.status === 'error' || (h.status === 'slow' && map[h.agent_id] !== 'error')) {
        map[h.agent_id] = h.status;
      }
    }
    return map;
  }, [conversation]);

  // Layer 2 → Layer 4: When agent node clicked, scroll to first message from that agent
  const handleAgentClick = useCallback((agentId: string | null) => {
    setActiveAgentId(agentId);
    if (agentId && conversation) {
      const idx = conversation.messages.findIndex((m) => m.agent_id === agentId);
      if (idx >= 0) {
        setScrollToMessageIndex(idx);
      }
    }
  }, [conversation]);

  // Layer 3 → Layer 2 + Layer 4: When timeline segment clicked
  const handleSegmentClick = useCallback((agentId: string, startTime: string) => {
    setActiveAgentId(agentId);
    if (conversation) {
      // Find the message closest to startTime
      const targetTs = new Date(startTime).getTime();
      let closestIdx = 0;
      let closestDiff = Infinity;
      conversation.messages.forEach((m, idx) => {
        const diff = Math.abs(new Date(m.timestamp).getTime() - targetTs);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIdx = idx;
        }
      });
      setScrollToMessageIndex(closestIdx);
    }
  }, [conversation]);

  // Layer 4 → Layer 2 + Layer 3: When message becomes visible during scroll
  const handleMessageVisible = useCallback((messageIndex: number) => {
    if (!conversation || conversation.messages.length === 0) return;
    const msg = conversation.messages[messageIndex];
    if (msg.agent_id) {
      setActiveAgentId(msg.agent_id);
    }
    // Update scroll position for timeline
    setScrollPosition(messageIndex / Math.max(1, conversation.messages.length - 1));
  }, [conversation]);

  // Layer 4 → Layer 2 + Layer 3: When a message is clicked
  const handleMessageClick = useCallback((messageIndex: number) => {
    if (!conversation) return;
    const msg = conversation.messages[messageIndex];
    if (msg.agent_id) {
      setActiveAgentId(msg.agent_id);
    }
    setScrollPosition(messageIndex / Math.max(1, conversation.messages.length - 1));
  }, [conversation]);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-slate-200 rounded-xl"></div>
          <div className="h-24 bg-slate-200 rounded-xl"></div>
          <div className="h-16 bg-slate-200 rounded-xl"></div>
          <div className="h-96 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !conversation) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-lg font-semibold text-text-primary mb-2">Conversation not found</p>
          <p className="text-sm text-text-secondary mb-4">
            The conversation ID &quot;{conversationId}&quot; could not be loaded.
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-4">
      {/* Layer 1 — Session Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Analytics
          </button>
          <StatusBadge
            status={outcomeToStatus(conversation.outcome)}
            label={conversation.outcome}
          />
        </div>

        <h2 className="text-xl font-bold text-text-primary mb-4">
          Conversation {conversation.conversation_id.slice(0, 12)}…
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Date & Time</p>
              <p className="text-sm font-medium text-text-primary">
                {formatDateTime(conversation.date)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Duration</p>
              <p className="text-sm font-medium text-text-primary">
                {formatDuration(conversation.duration_sec)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Turns</p>
              <p className="text-sm font-medium text-text-primary">{conversation.turns}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Mail size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">User</p>
              <p className="text-sm font-medium text-text-primary truncate max-w-[140px]">
                {conversation.user_email || '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Tool Calls</p>
              <p className={`text-sm font-medium ${conversation.has_tool_calls ? 'text-primary' : 'text-text-secondary'}`}>
                {conversation.has_tool_calls ? 'Yes' : 'No'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThumbsUp size={16} className="text-text-secondary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">Reactions</p>
              <p className="text-sm font-medium text-text-primary">
                <span className="text-success">{conversation.positive_reactions} 👍</span>
                {' / '}
                <span className="text-danger">{conversation.negative_reactions} 👎</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Layer 2 — Agent Orchestration Flow */}
      <OrchestrationFlow
        handoffs={conversation.handoffs}
        messages={conversation.messages}
        activeAgentId={activeAgentId}
        onAgentClick={handleAgentClick}
      />

      {/* Layer 3 — Timeline Scrubber */}
      <TimelineScrubber
        handoffs={conversation.handoffs}
        totalDurationSec={conversation.duration_sec}
        activeAgentId={activeAgentId}
        onSegmentClick={handleSegmentClick}
        scrollPosition={scrollPosition}
      />

      {/* Layer 4 — Message Thread */}
      <MessageThread
        messages={conversation.messages}
        agentStatusMap={agentStatusMap}
        activeAgentId={activeAgentId}
        scrollToIndex={scrollToMessageIndex}
        onMessageVisible={handleMessageVisible}
        onMessageClick={handleMessageClick}
      />
    </div>
  );
}

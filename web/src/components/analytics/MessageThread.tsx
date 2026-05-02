'use client';

import { useEffect, useRef, useCallback } from 'react';
import { User, Bot, Wrench, CheckCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/formatters';
import type { ConversationMessage } from '@/lib/api';

const AGENT_STATUS_BORDER: Record<string, string> = {
  ok: 'border-l-success',
  slow: 'border-l-warning',
  error: 'border-l-danger',
};

const AGENT_STATUS_DOT: Record<string, string> = {
  ok: 'bg-success',
  slow: 'bg-warning',
  error: 'bg-danger',
};

interface MessageThreadProps {
  messages: ConversationMessage[];
  /** Map of agent_id → status for coloring */
  agentStatusMap: Record<string, string>;
  activeAgentId: string | null;
  /** Index of the message to scroll to */
  scrollToIndex: number | null;
  onMessageVisible: (messageIndex: number) => void;
  onMessageClick: (messageIndex: number) => void;
}

export default function MessageThread({
  messages,
  agentStatusMap,
  activeAgentId,
  scrollToIndex,
  onMessageVisible,
  onMessageClick,
}: MessageThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll to a specific message
  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex >= 0 && scrollToIndex < messages.length) {
      const el = messageRefs.current[scrollToIndex];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToIndex, messages.length]);

  // IntersectionObserver for passive scroll sync
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-msg-index') || '-1');
          if (idx >= 0) {
            onMessageVisible(idx);
          }
        }
      }
    },
    [onMessageVisible]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, {
      root: containerRef.current,
      rootMargin: '0px',
      threshold: 0.5,
    });

    messageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [messages, observerCallback]);

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold text-text-primary">Message Thread</h3>
        <p className="text-xs text-text-secondary mt-0.5">{messages.length} messages</p>
      </div>

      <div
        ref={containerRef}
        className="p-4 space-y-3 max-h-[600px] overflow-y-auto"
      >
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';
          const agentStatus = msg.agent_id ? (agentStatusMap[msg.agent_id] || 'ok') : 'ok';
          const isHighlighted = activeAgentId && msg.agent_id === activeAgentId;
          const borderClass = !isUser && !isSystem ? (AGENT_STATUS_BORDER[agentStatus] || 'border-l-primary') : '';
          const dotClass = !isUser && !isSystem ? (AGENT_STATUS_DOT[agentStatus] || 'bg-primary') : '';

          return (
            <div
              key={msg.message_id || idx}
              ref={(el) => { messageRefs.current[idx] = el; }}
              data-msg-index={idx}
              onClick={() => onMessageClick(idx)}
              className={`
                flex gap-3 cursor-pointer rounded-lg p-3 transition-all
                ${isUser ? 'flex-row' : 'flex-row-reverse'}
                ${isHighlighted ? 'ring-2 ring-primary ring-opacity-50 bg-primary bg-opacity-5' : 'hover:bg-slate-50'}
                ${isSystem ? 'justify-center' : ''}
              `}
            >
              {/* Avatar */}
              {!isSystem && (
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full shrink-0
                  ${isUser ? 'bg-slate-200' : 'bg-primary bg-opacity-10'}
                `}>
                  {isUser ? (
                    <User size={16} className="text-text-secondary" />
                  ) : (
                    <Bot size={16} className="text-primary" />
                  )}
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`
                  flex-1 max-w-[80%]
                  ${isSystem ? 'max-w-full text-center' : ''}
                `}
              >
                {/* Agent label */}
                {!isUser && !isSystem && msg.agent_name && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                    <span className="text-xs font-medium text-text-secondary">
                      {msg.agent_name}
                    </span>
                    {msg.latency_ms !== null && (
                      <span className="text-xs text-text-secondary">
                        · {msg.latency_ms > 1000
                          ? `${(msg.latency_ms / 1000).toFixed(1)}s`
                          : `${msg.latency_ms}ms`}
                      </span>
                    )}
                  </div>
                )}

                {/* Content */}
                <div
                  className={`
                    rounded-lg px-4 py-2.5 text-sm leading-relaxed
                    ${isUser
                      ? 'bg-slate-100 text-text-primary'
                      : isSystem
                      ? 'bg-slate-50 text-text-secondary italic text-xs'
                      : `bg-white border-l-4 ${borderClass} shadow-sm text-text-primary`
                    }
                  `}
                >
                  {msg.content ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-text-secondary">
                        {isUser ? 'Message sent' : 'Response received'}
                      </span>
                      {msg.has_tool_calls && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                          <Wrench size={10} /> Tools used
                        </span>
                      )}
                      {msg.finish_reason === 'stop' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                          <CheckCircle size={10} /> Completed
                        </span>
                      )}
                      {msg.reaction_type && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full">
                          {msg.reaction_type === 'like' ? '👍' : '👎'} {msg.reaction_type}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <p className={`text-xs text-text-secondary mt-1 ${isUser ? 'text-left' : 'text-right'}`}>
                  {formatDateTime(msg.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

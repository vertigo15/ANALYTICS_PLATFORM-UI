'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { X, Trash2, ChevronDown, ChevronUp, Send, Loader2, GripVertical } from 'lucide-react';
import { useAIStore } from '@/store/ai';
import { useFiltersStore } from '@/store/filters';
import ChatMessage from './ChatMessage';
import SuggestedQuestions from './SuggestedQuestions';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'sql_result' | 'kpi_explanation' | 'error';
  timestamp: Date;
  [key: string]: any;
}

export default function AISidebar() {
  const pathname = usePathname();
  const { isAISidebarOpen, closeAISidebar, kpiValues, sidebarWidth, setSidebarWidth } = useAIStore();
  const { from, to, organizationId, agentId } = useFiltersStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [defaultSuggestions, setDefaultSuggestions] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);

  // Get current page from pathname
  const currentPage = pathname?.split('/').pop() || 'cost';

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load default suggestions
  useEffect(() => {
    if (isAISidebarOpen && messages.length === 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/suggestions/${currentPage}`)
        .then((res) => res.json())
        .then((data) => setDefaultSuggestions(data.suggestions || []))
        .catch(() => setDefaultSuggestions([]));
    }
  }, [isAISidebarOpen, currentPage, messages.length]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
    }
  }, [inputValue]);

  // Resize handlers
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(newWidth);
    },
    [setSidebarWidth]
  );

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          page: currentPage,
          context: {
            filters: {
              from,
              to,
              organizationId,
              agentId,
            },
            kpiValues,
          },
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        ...data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        type: 'error',
        content: 'Failed to get a response. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const clearHistory = () => {
    setMessages([]);
  };

  if (!isAISidebarOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 h-full bg-white border-l border-border shadow-xl flex flex-col z-50"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={startResizing}
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 group flex items-center"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <GripVertical size={12} className="text-text-secondary" />
        </div>
      </div>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-text-primary">Analytics Assistant</h2>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                title="Clear history"
              >
                <Trash2 size={16} className="text-text-secondary" />
              </button>
            )}
            <button
              onClick={closeAISidebar}
              className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            >
              <X size={18} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Context Pills */}
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
            {currentPage.charAt(0).toUpperCase() + currentPage.slice(1)} Dashboard
          </span>
          <span className="inline-block px-2 py-1 bg-slate-100 text-text-secondary text-xs rounded">
            {from} – {to}
          </span>
        </div>

        {/* Collapsible Context */}
        <button
          onClick={() => setShowContext(!showContext)}
          className="flex items-center justify-between w-full text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>What I know about your current view</span>
          {showContext ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showContext && (
          <div className="mt-2 p-2 bg-slate-50 rounded text-xs space-y-1">
            <div>
              <span className="font-medium">Page:</span> {currentPage}
            </div>
            <div>
              <span className="font-medium">Date Range:</span> {from} to {to}
            </div>
            {organizationId && (
              <div>
                <span className="font-medium">Org:</span> {organizationId}
              </div>
            )}
            {agentId && (
              <div>
                <span className="font-medium">Agent:</span> {agentId}
              </div>
            )}
            {Object.keys(kpiValues).length > 0 && (
              <div>
                <span className="font-medium">KPIs:</span>
                <div className="ml-2 mt-1">
                  {Object.entries(kpiValues).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <h3 className="text-sm font-medium text-text-primary mb-4">
              Ask me anything about your analytics
            </h3>
            {defaultSuggestions.length > 0 && (
              <SuggestedQuestions
                suggestions={defaultSuggestions}
                onSelect={(q) => sendMessage(q)}
              />
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const messageProps = {
                ...msg,
                type: msg.type || 'text' as const,
                onSuggestionClick: (q: string) => sendMessage(q),
              };
              return <ChatMessage key={index} {...messageProps as any} />;
            })}
            {isLoading && (
              <div className="flex items-center gap-2 text-text-secondary">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              disabled={isLoading}
              className="w-full px-3 py-2 pr-10 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 top-2 p-1.5 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            Read-only · Gold schema only
          </p>
        </form>
      </div>
    </div>
  );
}

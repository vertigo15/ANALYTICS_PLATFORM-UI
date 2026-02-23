import React from 'react';
import ReactMarkdown from 'react-markdown';
import KpiExplanation, { KpiDefinition } from './KpiExplanation';
import SqlResult from './SqlResult';
import SuggestedQuestions from './SuggestedQuestions';

interface BaseMessage {
  role: 'user' | 'assistant';
  timestamp: Date;
  onSuggestionClick?: (question: string) => void;
}

interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
  suggestions?: string[];
}

interface KpiMessage extends BaseMessage {
  type: 'kpi_explanation';
  content: string;
  kpiDefinition: KpiDefinition;
  suggestions?: string[];
}

interface SqlMessage extends BaseMessage {
  type: 'sql_result';
  content: string;
  sql: string;
  data: Record<string, any>[];
  columns: string[];
  narrative: string;
  suggestions?: string[];
}

interface ErrorMessage extends BaseMessage {
  type: 'error';
  content: string;
}

type ChatMessageProps = TextMessage | KpiMessage | SqlMessage | ErrorMessage;

export default function ChatMessage(props: ChatMessageProps) {
  const { role, timestamp } = props;

  const timeString = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // User message
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%]">
          <div className="bg-primary text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl px-4 py-2">
            <p className="text-sm">{props.content}</p>
          </div>
          <p className="text-xs text-text-secondary mt-1 text-right">{timeString}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%]">
        <div className="bg-white border border-border rounded-lg p-4">
          {props.type === 'text' && (
            <div className="text-sm text-text-primary prose prose-sm max-w-none prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-text-primary">
              <ReactMarkdown>{props.content}</ReactMarkdown>
            </div>
          )}

          {props.type === 'kpi_explanation' && (
            <div className="space-y-3">
              <KpiExplanation definition={props.kpiDefinition} />
            </div>
          )}

          {props.type === 'sql_result' && (
            <SqlResult
              sql={props.sql}
              data={props.data}
              columns={props.columns}
              narrative={props.narrative}
            />
          )}

          {props.type === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-amber-800">{props.content}</p>
            </div>
          )}

          {/* Suggested Questions */}
          {props.type !== 'error' && 'suggestions' in props && props.suggestions && props.suggestions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-text-secondary mb-2">Suggested follow-ups:</p>
              <SuggestedQuestions
                suggestions={props.suggestions}
                onSelect={props.onSuggestionClick || (() => {})}
              />
            </div>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-1">{timeString}</p>
      </div>
    </div>
  );
}

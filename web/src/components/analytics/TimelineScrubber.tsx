'use client';

import { useMemo } from 'react';
import type { AgentHandoff } from '@/lib/api';

const STATUS_BG: Record<string, string> = {
  ok: '#16A34A',
  slow: '#D97706',
  error: '#DC2626',
};

interface TimelineScrubberProps {
  handoffs: AgentHandoff[];
  totalDurationSec: number;
  activeAgentId: string | null;
  onSegmentClick: (agentId: string, startTime: string) => void;
  /** Current scroll position as a percentage 0–1 */
  scrollPosition?: number;
}

export default function TimelineScrubber({
  handoffs,
  totalDurationSec,
  activeAgentId,
  onSegmentClick,
  scrollPosition = 0,
}: TimelineScrubberProps) {
  // Calculate segment widths as percentages of total duration
  const segments = useMemo(() => {
    if (handoffs.length === 0 || totalDurationSec <= 0) return [];

    const firstTs = new Date(handoffs[0].start_time).getTime();
    const totalMs = totalDurationSec * 1000;

    return handoffs.map((h) => {
      const startMs = new Date(h.start_time).getTime() - firstTs;
      const endMs = new Date(h.end_time).getTime() - firstTs;
      const durationMs = Math.max(endMs - startMs, totalMs * 0.02); // min 2% width

      return {
        ...h,
        leftPct: Math.max(0, (startMs / totalMs) * 100),
        widthPct: Math.min(100, (durationMs / totalMs) * 100),
        color: STATUS_BG[h.status] || STATUS_BG.ok,
      };
    });
  }, [handoffs, totalDurationSec]);

  if (segments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-sm text-text-secondary text-center">No timeline data</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Timeline</h3>

      {/* Timeline bar */}
      <div className="relative w-full h-10 bg-slate-100 rounded-lg overflow-hidden">
        {segments.map((seg) => {
          const isActive = activeAgentId === seg.agent_id;

          return (
            <button
              key={`${seg.agent_id}-${seg.order_index}`}
              onClick={() => onSegmentClick(seg.agent_id, seg.start_time)}
              className={`absolute top-0 h-full transition-all hover:brightness-110 ${
                isActive ? 'ring-2 ring-primary ring-inset z-10' : ''
              }`}
              style={{
                left: `${seg.leftPct}%`,
                width: `${seg.widthPct}%`,
                backgroundColor: seg.color,
                opacity: activeAgentId && !isActive ? 0.4 : 0.85,
              }}
              title={`${seg.agent_name} (${seg.status})`}
            />
          );
        })}

        {/* Position indicator */}
        <div
          className="absolute top-0 h-full w-0.5 bg-text-primary z-20 transition-all pointer-events-none"
          style={{ left: `${Math.min(scrollPosition * 100, 100)}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {segments.map((seg) => (
          <div
            key={`legend-${seg.agent_id}-${seg.order_index}`}
            className="flex items-center gap-1.5"
          >
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-text-secondary truncate max-w-[100px]">
              {seg.agent_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

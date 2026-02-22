import React from 'react';

export interface KpiDefinition {
  name: string;
  formula: string;
  source_table: string;
  description: string;
  caveats?: string;
}

interface KpiExplanationProps {
  definition: KpiDefinition;
}

export default function KpiExplanation({ definition }: KpiExplanationProps) {
  return (
    <div className="bg-white border border-border rounded-lg p-4 space-y-3">
      <h3 className="font-bold text-text-primary text-lg">{definition.name}</h3>
      
      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-text-secondary uppercase mb-1">Formula</p>
          <code className="block bg-slate-50 p-2 rounded text-sm font-mono text-text-primary">
            {definition.formula}
          </code>
        </div>

        <div>
          <p className="text-xs font-medium text-text-secondary uppercase mb-1">Source</p>
          <span className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm font-mono">
            {definition.source_table}
          </span>
        </div>

        <div>
          <p className="text-xs font-medium text-text-secondary uppercase mb-1">Description</p>
          <p className="text-sm text-text-primary">{definition.description}</p>
        </div>

        {definition.caveats && (
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase mb-1">Caveats</p>
            <p className="text-sm text-text-secondary italic">{definition.caveats}</p>
          </div>
        )}
      </div>
    </div>
  );
}

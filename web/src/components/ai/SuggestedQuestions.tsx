import React from 'react';

interface SuggestedQuestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
}

export default function SuggestedQuestions({ suggestions, onSelect }: SuggestedQuestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((question, index) => (
        <button
          key={index}
          onClick={() => onSelect(question)}
          className="px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:border-primary hover:text-primary hover:bg-blue-50 transition-colors text-left"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

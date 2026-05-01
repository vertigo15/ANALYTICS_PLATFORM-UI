'use client';

import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Chart render error:', error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center min-h-[200px] border border-red-200">
          <div className="text-red-500 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">This chart couldn&apos;t load</p>
          <p className="text-xs text-text-secondary mb-4">An unexpected rendering error occurred.</p>
          <button onClick={this.handleReset}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-blue-700 transition-colors">
            Try refreshing
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

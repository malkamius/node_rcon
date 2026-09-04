import React from 'react';

export interface TabErrorBoundaryProps {
  children?: React.ReactNode;
  tabName?: string;
  onReset?: () => void;
}

export interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('TabErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="tab-error-boundary-fallback"
          style={{
            padding: 24,
            margin: '24px auto',
            maxWidth: 600,
            background: '#2d1b1e',
            border: '1px solid #cf222e',
            borderRadius: 8,
            color: '#eee',
          }}
        >
          <h3 style={{ color: '#ff7b72', marginTop: 0 }}>
            Something went wrong displaying {this.props.tabName || 'this tab'}
          </h3>
          <p style={{ color: '#ccc', fontSize: 13, wordBreak: 'break-word' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) this.props.onReset();
            }}
            style={{
              background: '#3a3f4b',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '6px 14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Tab
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

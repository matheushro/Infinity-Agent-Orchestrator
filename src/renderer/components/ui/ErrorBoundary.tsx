// Last-resort error boundary. Without one, any exception thrown during a
// render or commit (including effect cleanups while unmounting a node)
// unmounts the whole React tree and leaves the window completely white.
// Styles are inline on purpose: the fallback must render even if the app's
// CSS/theme pipeline is part of what broke.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[error-boundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: '#0b1120',
          color: '#e2e8f0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 520, wordBreak: 'break-word' }}>
          {this.state.error.message}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #3b82f6',
            background: '#1d4ed8',
            color: '#ffffff',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Reload app
        </button>
      </div>
    )
  }
}

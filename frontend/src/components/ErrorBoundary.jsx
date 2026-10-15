import { Component } from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In a real deployment this is where you'd ship the error to a logging
    // service. For now, at least it's visible in the browser console
    // instead of silently failing.
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="d-flex flex-column align-items-center justify-content-center text-center vh-100 px-4"
          style={{ background: 'var(--surface-alt, #f6f6f8)' }}
        >
          <AlertTriangle size={40} color="var(--brand, #ff4b3e)" className="mb-3" />
          <h5 className="mb-2">Something went wrong</h5>
          <p className="text-muted mb-4" style={{ maxWidth: 380 }}>
            This screen hit an unexpected error. Reloading usually fixes it — if it keeps
            happening, check that the backend server is running.
          </p>
          <button className="btn btn-dark d-flex align-items-center gap-2" onClick={() => window.location.reload()}>
            <RefreshCcw size={15} /> Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * If a screen crashes while rendering, show what happened and a Reload button instead of an empty
 * screen. Nothing is deleted: documents and the license stay on the phone.
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('DocGen Mobile error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: '18vh 20px 0', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }} data-testid="app-error">
        <h2>Something went wrong</h2>
        <p style={{ color: '#475467' }}>Your documents are safe on this phone. Please reload DocGen.</p>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#667085', fontSize: 12 }}>{String(error?.message || error)}</pre>
        <button style={{ padding: '12px 22px', fontSize: 16, borderRadius: 10, border: 0, background: '#2251cc', color: '#fff' }} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

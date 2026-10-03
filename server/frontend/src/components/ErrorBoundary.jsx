/**
 * Last line of defence: if a page crashes while rendering, show what happened and a way out
 * instead of an empty white page.
 */

import { Component } from 'react';
import { session } from '../api.js';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('DocGen page error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const signOutAndReload = () => {
      session.set('client', '');
      session.set('admin', '');
      window.location.reload();
    };
    return (
      <div className="success center" style={{ margin: '12vh auto', padding: '0 16px' }} data-testid="page-error">
        <h1>This page could not be shown</h1>
        <p className="muted">Please reload. If it happens again, sign out and reload, or write to support@reynrel.in with the message below.</p>
        <pre className="muted small" style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{String(error?.message || error)}</pre>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={signOutAndReload}>
            Sign out and reload
          </button>
        </div>
      </div>
    );
  }
}

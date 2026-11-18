import { Component } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/** Catches crashes so users see a friendly screen instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // After an update, an old open tab may ask for files that no longer exist → reload once to get the new version
    const stale = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message));
    if (stale && !sessionStorage.getItem('gva-reloaded')) {
      try { sessionStorage.setItem('gva-reloaded', '1'); } catch {}
      window.location.reload();
    }
    console.error(error);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.full ? 'flex min-h-screen items-center justify-center p-6' : 'flex justify-center py-20'}>
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-amber-50 p-4 text-amber-600 dark:bg-amber-500/10"><AlertTriangle className="h-8 w-8" /></div>
          <h1 className="text-xl font-bold">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-slate-500">Your data is safe. Reload the page to continue. If it keeps happening, tell your administrator what you were doing.</p>
          <button onClick={() => window.location.reload()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-olive-600 px-5 text-sm font-semibold text-white hover:bg-olive-700">
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}

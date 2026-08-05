import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/sora';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './shell.css';
import './epic-design-system.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Epic BOS could not find its renderer root.');
}

type RendererErrorBoundaryProps = { children: React.ReactNode };
type RendererErrorBoundaryState = { error: Error | null };

function RendererFailure({ error, loading = false }: { error?: Error; loading?: boolean }): React.ReactNode {
  if (loading) {
    return <main className="loading-state" aria-busy="true">
      <span className="brand__mark brand__mark--loading" aria-hidden="true"><span /><span /><span /></span>
      <p>Starting Epic BOS securely…</p>
    </main>;
  }
  return <main className="fatal-state" role="alert">
    <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
    <h1>Epic BOS could not render its workspace</h1>
    <p>{error?.message || 'The renderer encountered an unexpected startup error.'}</p>
    <button type="button" className="button button--primary" onClick={() => window.location.reload()}>Retry workspace</button>
  </main>;
}

class RendererErrorBoundary extends React.Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  public override state: RendererErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('EPIC_BOS_RENDERER_ERROR', error, info);
  }

  public override render(): React.ReactNode {
    return this.state.error ? <RendererFailure error={this.state.error} /> : this.props.children;
  }
}

const rendererRoot = createRoot(root);
rendererRoot.render(<RendererFailure loading />);

void import('./renderer/App')
  .then(({ App }) => {
    rendererRoot.render(
      <React.StrictMode>
        <RendererErrorBoundary><App /></RendererErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const rendererError = error instanceof Error ? error : new Error(String(error));
    console.error('EPIC_BOS_RENDERER_BOOT_ERROR', rendererError);
    rendererRoot.render(<RendererFailure error={rendererError} />);
  });

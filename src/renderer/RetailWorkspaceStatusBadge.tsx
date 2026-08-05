import {
  CircleAlert,
  DatabaseBackup,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { RetailWorkspaceModeProjection } from '../domain/retail-workspace-mode';

type RetailWorkspaceStatusTone = 'demo' | 'clean' | 'imported' | 'live' | 'review';

interface RetailWorkspaceStatusPresentation {
  shortLabel: 'Legacy cleanup' | 'Clean' | 'Imported' | 'Live' | 'Needs review';
  tone: RetailWorkspaceStatusTone;
  Icon: LucideIcon;
}

/**
 * Converts the safety projection into the short, plain-language label shown
 * to a store operator. This is intentionally driven only by the projection:
 * a UI cannot infer a successful connection or reconciliation.
 */
export function presentRetailWorkspaceStatus(
  projection: RetailWorkspaceModeProjection,
): RetailWorkspaceStatusPresentation {
  switch (projection.dataStatus) {
    case 'sample':
      return { shortLabel: 'Legacy cleanup', tone: 'review', Icon: ShieldAlert };
    case 'empty':
      return { shortLabel: 'Clean', tone: 'clean', Icon: ShieldCheck };
    case 'shadow-imported':
      return { shortLabel: 'Imported', tone: 'imported', Icon: DatabaseBackup };
    case 'live':
      return { shortLabel: 'Live', tone: 'live', Icon: RadioTower };
    case 'unclassified':
      return { shortLabel: 'Needs review', tone: 'review', Icon: ShieldAlert };
  }
}

export interface RetailWorkspaceStatusBadgeProps {
  /** A renderer-safe, provenance-aware workspace state supplied by the shell. */
  projection: RetailWorkspaceModeProjection;
  className?: string;
}

/**
 * Compact workspace provenance status for the retail shell. It reports only
 * facts present in the projection and deliberately has no inferred sync state.
 */
export function RetailWorkspaceStatusBadge({
  projection,
  className,
}: RetailWorkspaceStatusBadgeProps): ReactNode {
  const presentation = presentRetailWorkspaceStatus(projection);
  const Icon = presentation.Icon;
  const externalWritePolicy = projection.externalWritePolicy === 'governed'
    ? 'External writes governed'
    : 'External writes blocked';
  const componentClassName = [
    'retail-workspace-status-badge',
    `retail-workspace-status-badge--${presentation.tone}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <article
      className={componentClassName}
      data-testid="retail-workspace-status-badge"
      data-workspace-status={projection.dataStatus}
      role="status"
      aria-live="polite"
      aria-label={`Workspace status: ${presentation.shortLabel}`}
    >
      <div className="retail-workspace-status-badge__headline">
        <span className="retail-workspace-status-badge__icon" aria-hidden="true">
          <Icon size={17} strokeWidth={2} />
        </span>
        <div>
          <span className="retail-workspace-status-badge__eyebrow">Workspace status</span>
          <strong>{presentation.shortLabel}</strong>
        </div>
      </div>
      <div className="retail-workspace-status-badge__content">
        <span className="retail-workspace-status-badge__title">{projection.label}</span>
        <p>{projection.description}</p>
        {projection.sourceSystem ? (
          <p className="retail-workspace-status-badge__source">
            Source: <strong>{projection.sourceSystem}</strong>
          </p>
        ) : null}
        <div className="retail-workspace-status-badge__controls" aria-label="Workspace safeguards">
          <span data-policy={projection.externalWritePolicy}>{externalWritePolicy}</span>
          {projection.requiresReconciliation ? (
            <span data-reconciliation="required">
              <CircleAlert size={14} aria-hidden="true" />
              Reconciliation required
            </span>
          ) : null}
        </div>
        <p className="retail-workspace-status-badge__next-action">
          <strong>Next:</strong> {projection.nextAction}
        </p>
      </div>
    </article>
  );
}

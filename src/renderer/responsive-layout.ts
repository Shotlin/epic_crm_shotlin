export type ViewportClass = 'compact' | 'tablet' | 'desktop';

export interface ResponsiveLayoutPolicy {
  viewport: ViewportClass;
  navigation: 'drawer' | 'rail' | 'full-rail';
  actionDensity: 'stacked' | 'comfortable' | 'dense';
  showSecondaryLabels: boolean;
}

/** Keeps the Electron shell usable across laptop, tablet, and compact windows. */
export function getResponsiveLayoutPolicy(width: number, height: number): ResponsiveLayoutPolicy {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  // The inclusive width boundaries mirror shell.css. Height guards preserve
  // compact action density for unusually short utility windows.
  if (safeWidth <= 760 || safeHeight < 560) return { viewport: 'compact', navigation: 'drawer', actionDensity: 'stacked', showSecondaryLabels: false };
  if (safeWidth <= 1120 || safeHeight < 720) return { viewport: 'tablet', navigation: 'rail', actionDensity: 'comfortable', showSecondaryLabels: true };
  return { viewport: 'desktop', navigation: 'full-rail', actionDensity: 'dense', showSecondaryLabels: true };
}

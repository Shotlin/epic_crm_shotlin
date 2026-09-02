/**
 * Immutable layout values captured from the pinned Bakaloo application shell.
 *
 * This deliberately sits outside React so tests, responsive UI code and visual
 * regression tooling use one source of truth instead of duplicating breakpoints
 * in several workbenches.
 */
export const BAKALOO_DESIGN_TOKENS = {
  background: 'hsl(210 20% 98%)',
  foreground: 'hsl(220 14% 10%)',
  primary: 'hsl(217 91% 60%)',
  brand500: '#2563EB',
  brand600: '#1D4ED8',
  surface: '#F0F4F8',
  border: 'hsl(218 13% 90%)',
  radius: 8,
  sidebarExpanded: 260,
  sidebarCollapsed: 72,
  headerHeight: 64,
  desktopPagePadding: 24,
  mobilePagePadding: 16,
} as const;

export interface BakalooShellLayoutInput {
  viewportWidth: number;
  collapsed: boolean;
}

export interface BakalooShellLayout {
  navigation: 'sidebar' | 'overlay';
  sidebarWidth: number;
  headerHeight: number;
  pagePadding: number;
}

/**
 * Public responsive policy for the Electron shell. The 768px breakpoint is
 * intentionally aligned with the reference dashboard's mobile navigation.
 */
export function resolveBakalooShellLayout({ viewportWidth, collapsed }: BakalooShellLayoutInput): BakalooShellLayout {
  if (viewportWidth < 768) {
    return {
      navigation: 'overlay',
      sidebarWidth: 0,
      headerHeight: BAKALOO_DESIGN_TOKENS.headerHeight,
      pagePadding: BAKALOO_DESIGN_TOKENS.mobilePagePadding,
    };
  }

  return {
    navigation: 'sidebar',
    sidebarWidth: collapsed ? BAKALOO_DESIGN_TOKENS.sidebarCollapsed : BAKALOO_DESIGN_TOKENS.sidebarExpanded,
    headerHeight: BAKALOO_DESIGN_TOKENS.headerHeight,
    pagePadding: BAKALOO_DESIGN_TOKENS.desktopPagePadding,
  };
}

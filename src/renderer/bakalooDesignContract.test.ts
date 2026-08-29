import { describe, expect, it } from 'vitest';
import { resolveBakalooShellLayout } from './bakalooDesignContract';

describe('Bakaloo shell layout policy', () => {
  it('uses the pinned desktop geometry for expanded and collapsed navigation', () => {
    expect(resolveBakalooShellLayout({ viewportWidth: 1440, collapsed: false })).toEqual({
      navigation: 'sidebar',
      sidebarWidth: 260,
      headerHeight: 64,
      pagePadding: 24,
    });
    expect(resolveBakalooShellLayout({ viewportWidth: 1440, collapsed: true })).toEqual({
      navigation: 'sidebar',
      sidebarWidth: 72,
      headerHeight: 64,
      pagePadding: 24,
    });
  });

  it('uses an overlay navigation and Bakaloo mobile gutters below the desktop breakpoint', () => {
    expect(resolveBakalooShellLayout({ viewportWidth: 767, collapsed: false })).toEqual({
      navigation: 'overlay',
      sidebarWidth: 0,
      headerHeight: 64,
      pagePadding: 16,
    });
  });
});

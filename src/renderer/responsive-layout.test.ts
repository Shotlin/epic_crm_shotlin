import { describe, expect, it } from 'vitest';
import { getResponsiveLayoutPolicy } from './responsive-layout';

describe('responsive layout policy', () => {
  it('uses a drawer and stacked actions for compact windows', () => {
    expect(getResponsiveLayoutPolicy(640, 800)).toEqual({ viewport: 'compact', navigation: 'drawer', actionDensity: 'stacked', showSecondaryLabels: false });
    expect(getResponsiveLayoutPolicy(1200, 500).viewport).toBe('compact');
  });

  it('keeps a rail for tablet and a full rail for desktop', () => {
    expect(getResponsiveLayoutPolicy(900, 800)).toMatchObject({ viewport: 'tablet', navigation: 'rail', actionDensity: 'comfortable' });
    expect(getResponsiveLayoutPolicy(1440, 900)).toMatchObject({ viewport: 'desktop', navigation: 'full-rail', actionDensity: 'dense' });
  });

  it('matches the inclusive CSS shell width breakpoints', () => {
    expect(getResponsiveLayoutPolicy(760, 900)).toMatchObject({ viewport: 'compact', navigation: 'drawer', actionDensity: 'stacked' });
    expect(getResponsiveLayoutPolicy(761, 900)).toMatchObject({ viewport: 'tablet', navigation: 'rail', actionDensity: 'comfortable' });
    expect(getResponsiveLayoutPolicy(1120, 900)).toMatchObject({ viewport: 'tablet', navigation: 'rail', actionDensity: 'comfortable' });
    expect(getResponsiveLayoutPolicy(1121, 720)).toMatchObject({ viewport: 'desktop', navigation: 'full-rail', actionDensity: 'dense' });
  });

  it('keeps the Electron minimum desktop viewport on a legible rail', () => {
    expect(getResponsiveLayoutPolicy(1080, 720)).toMatchObject({ viewport: 'tablet', navigation: 'rail', showSecondaryLabels: true });
  });
});

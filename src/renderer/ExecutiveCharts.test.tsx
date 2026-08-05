import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart, DonutChart, TrendLineChart } from './ExecutiveCharts';

afterEach(() => cleanup());

describe('ExecutiveCharts', () => {
  it('shows an honest accessible empty state when no governed rows exist', () => {
    render(<TrendLineChart title="Sales by day" data={[]} />);
    expect(screen.getByRole('status').textContent).toContain('No governed data yet');
  });

  it('renders chart figures with a readable value description and legend', () => {
    render(<><BarChart title="Sales" data={[{ label: 'POS', value: 1200 }]} /><DonutChart title="Tender mix" data={[{ label: 'UPI', value: 1200 }]} /></>);
    expect(screen.getByRole('img', { name: /Sales: POS 1,200/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Tender mix: UPI 1,200/i })).toBeTruthy();
    expect(screen.getAllByRole('list', { name: /Chart values|Tender values|Trend values/i }).length).toBeGreaterThan(0);
  });
});

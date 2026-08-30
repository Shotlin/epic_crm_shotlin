import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailDeliveryExceptionsPanel } from './RetailDeliveryExceptionsPanel';
afterEach(() => cleanup());
describe('RetailDeliveryExceptionsPanel', () => { it('does not invent an RTO outcome or refund when evidence is absent', () => { render(<RetailDeliveryExceptionsPanel revenue={{ shipmentPackages: [], returnAuthorizations: [], codCollectionCases: [] } as Pick<RevenueOpsSnapshot, 'shipmentPackages' | 'returnAuthorizations' | 'codCollectionCases'>} onOpenAdvanced={vi.fn()} />); expect(screen.getByRole('heading', { name: 'Close the delivery loop with physical and financial evidence.' })).toBeTruthy(); expect(screen.getByText(/No carrier or customer return outcome is assumed/i)).toBeTruthy(); expect(screen.queryByRole('button', { name: /refund|receive goods|confirm carrier/i })).toBeNull(); }); });

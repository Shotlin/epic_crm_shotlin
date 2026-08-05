import type { CreditLimitControl } from '../shared/collections-finance-contracts';
import type { Receivable } from '../shared/revenue-ops-contracts';

export type CreditUtilisationState = 'clear' | 'warning' | 'hold' | 'pending-review' | 'rejected' | 'superseded';
export type CreditUtilisationNextAction = 'monitor' | 'review-exposure' | 'credit-hold' | 'approve-credit' | 'revise-credit' | 'closed';

export interface CreditUtilisationRow {
  controlId: string;
  controlNumber: string;
  accountId: string;
  status: CreditLimitControl['status'];
  riskGrade: CreditLimitControl['riskGrade'];
  creditLimit: number;
  exposure: number;
  availableCredit: number;
  utilisationPercent: number;
  warningThresholdPercent: number;
  warningTriggered: boolean;
  overdueAmount: number;
  overdueDays: number;
  overdueBeyondGrace: boolean;
  graceDays: number;
  blockNewOrders: boolean;
  state: CreditUtilisationState;
  nextAction: CreditUtilisationNextAction;
  actionRequired: boolean;
}

export interface CreditUtilisationInput {
  controls: CreditLimitControl[];
  receivables: Receivable[];
  asOfDate: string;
}

export interface CreditUtilisationReport {
  asOfDate: string;
  controlCount: number;
  approvedControlCount: number;
  pendingControlCount: number;
  totalLimit: number;
  totalExposure: number;
  totalAvailable: number;
  warningCount: number;
  holdCount: number;
  actionRequired: boolean;
  rows: CreditUtilisationRow[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function openReceivable(item: Receivable): boolean {
  return item.outstandingAmount > 0 && !['paid', 'written-off'].includes(item.status);
}

/**
 * Computes the customer-credit view used by collections and the retail POS.
 * It is intentionally a projection: it never mutates AR and never treats a
 * pending/rejected policy as available counter credit.
 */
export function computeCreditLimitUtilisation({ controls, receivables, asOfDate }: CreditUtilisationInput): CreditUtilisationReport {
  const activeControls = controls.filter(({ status }) => status !== 'superseded');
  const rows = activeControls.map((control): CreditUtilisationRow => {
    const accountReceivables = receivables.filter((item) => item.accountId === control.accountId && openReceivable(item));
    const exposure = money(accountReceivables.reduce((total, item) => total + item.outstandingAmount, 0));
    const overdueItems = accountReceivables.filter((item) => item.dueDate < asOfDate);
    const overdueAmount = money(overdueItems.reduce((total, item) => total + item.outstandingAmount, 0));
    const overdueDays = overdueItems.length ? Math.max(...overdueItems.map((item) => Math.max(0, Math.floor((Date.parse(`${asOfDate}T00:00:00.000Z`) - Date.parse(`${item.dueDate}T00:00:00.000Z`)) / 86_400_000)))) : 0;
    const approved = control.status === 'approved';
    const utilisationPercent = approved && control.creditLimit > 0 ? money((exposure / control.creditLimit) * 100) : 0;
    const availableCredit = approved ? money(Math.max(0, control.creditLimit - exposure)) : 0;
    const warningTriggered = approved && (control.creditLimit === 0 ? exposure > 0 : utilisationPercent >= control.warningThresholdPercent);
    const overdueBeyondGrace = approved && overdueAmount > 0 && overdueDays > control.graceDays;
    const hardHold = approved && (exposure > control.creditLimit || overdueBeyondGrace);
    const state: CreditUtilisationState = control.status === 'pending'
      ? 'pending-review'
      : control.status === 'rejected'
        ? 'rejected'
        : hardHold
          ? 'hold'
          : warningTriggered
            ? 'warning'
            : control.status === 'superseded'
              ? 'superseded'
              : 'clear';
    const nextAction: CreditUtilisationNextAction = control.status === 'pending'
      ? 'approve-credit'
      : control.status === 'rejected'
        ? 'revise-credit'
        : control.status === 'superseded'
          ? 'closed'
          : hardHold
            ? 'credit-hold'
            : warningTriggered
              ? 'review-exposure'
              : 'monitor';
    return {
      controlId: control.id,
      controlNumber: control.number,
      accountId: control.accountId,
      status: control.status,
      riskGrade: control.riskGrade,
      creditLimit: control.creditLimit,
      exposure,
      availableCredit,
      utilisationPercent,
      warningThresholdPercent: control.warningThresholdPercent,
      warningTriggered,
      overdueAmount,
      overdueDays,
      overdueBeyondGrace,
      graceDays: control.graceDays,
      blockNewOrders: control.blockNewOrders,
      state,
      nextAction,
      actionRequired: !['clear', 'superseded'].includes(state),
    };
  });
  const approvedRows = rows.filter(({ status }) => status === 'approved');
  return {
    asOfDate,
    controlCount: rows.length,
    approvedControlCount: approvedRows.length,
    pendingControlCount: rows.filter(({ status }) => status === 'pending').length,
    totalLimit: money(approvedRows.reduce((total, row) => total + row.creditLimit, 0)),
    totalExposure: money(approvedRows.reduce((total, row) => total + row.exposure, 0)),
    totalAvailable: money(approvedRows.reduce((total, row) => total + row.availableCredit, 0)),
    warningCount: rows.filter(({ warningTriggered }) => warningTriggered).length,
    holdCount: rows.filter(({ state }) => state === 'hold').length,
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

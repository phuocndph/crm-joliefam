import type { ProductEarnings } from './production-dispatch-types';

type AttendanceIncomeRow = {
  work_date: string;
  attendance_method: string;
  workflow_status?: string | null;
  is_reversed?: boolean | null;
  cost_visible?: boolean;
  calculated_amount?: number | string | null;
};

const amountNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

/** Display-only totals: product income comes from the employee earnings endpoint. */
export function attendanceIncomeSummary(
  attendance: AttendanceIncomeRow[],
  earnings: ProductEarnings | null,
  month: string,
  workDate?: string,
) {
  let approved = 0;
  let submitted = 0;
  let approvedOutput = 0;
  let submittedOutput = 0;
  let approvedOutputUnavailable = false;
  let submittedOutputUnavailable = false;
  let approvedUnavailable = false;
  let submittedUnavailable = false;
  const inPeriod = (date: string) => date.slice(0, 7) === month && (!workDate || date.slice(0, 10) === workDate);
  for (const row of attendance) {
    if (!inPeriod(row.work_date) || row.is_reversed || !['DAY', 'HOUR'].includes(row.attendance_method)) continue;
    const status = row.workflow_status || 'SUBMITTED';
    const amount = row.cost_visible ? amountNumber(row.calculated_amount) : null;
    if (amount === null) continue;
    if (status === 'APPROVED' || status === 'LOCKED') approved += amount;
    if (status === 'SUBMITTED') submitted += amount;
  }
  if (!earnings || earnings.month !== month || (workDate && workDate.slice(0, 7) !== month)) {
    approvedUnavailable = true;
    submittedUnavailable = true;
    approvedOutputUnavailable = true;
    submittedOutputUnavailable = true;
  } else {
    const seen = new Set<string>();
    for (const row of earnings.rows) {
      if (!inPeriod(row.work_date)) continue;
      const key = `${row.source_kind}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.status === 'APPROVED' || row.status === 'LOCKED') {
        const quantity = amountNumber(row.quantity_good);
        if (quantity === null || quantity < 0) approvedOutputUnavailable = true;
        else approvedOutput += quantity;
        // Approved snapshots remain authoritative even if current eligibility changes.
        const amount = amountNumber(row.approved_amount);
        if (amount === null) approvedUnavailable = true;
        else approved += amount;
      } else if (row.status === 'SUBMITTED') {
        // Progress includes non-payable repair reports; income remains separate.
        const quantity = amountNumber(row.quantity_good);
        if (quantity === null || quantity < 0) submittedOutputUnavailable = true;
        else submittedOutput += quantity;
        const amount = amountNumber(row.pending_amount);
        if (row.is_payable === false || row.unavailable_reason || amount === null) submittedUnavailable = true;
        else submitted += amount;
      }
    }
  }
  return {
    approvedOutput: approvedOutputUnavailable ? null : approvedOutput,
    submittedOutput: submittedOutputUnavailable ? null : submittedOutput,
    output: approvedOutputUnavailable || submittedOutputUnavailable ? null : approvedOutput + submittedOutput,
    approvedAmount: approvedUnavailable ? null : approved,
    submittedAmount: submittedUnavailable ? null : submitted,
    amount: approvedUnavailable || submittedUnavailable ? null : approved + submitted,
    knownAmount: approved + submitted,
    unavailable: approvedUnavailable || submittedUnavailable,
  };
}

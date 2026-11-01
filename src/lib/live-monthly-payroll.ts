import ExcelJS from "exceljs";
import type {
  CompensationType,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceRow,
  FactoryOvertimeRow,
  PayrollAdjustment,
  PayrollBankAccount,
  PayrollWorker,
  ProductionEntryRow,
  SocialInsuranceVersion,
  WorkerCompensationAssignment,
  WorkerCompensationRate,
  WorkerPayrollProfile,
} from "@/integrations/supabase/production-execution-types";

export type InlineWorkerMonthOverride = {
  manualBonus?: number;
  manualPenalty?: number;
  advanceAmount?: number;
  paymentStatus?: "UNPAID" | "PAID";
  paidAt?: string | null;
  notes?: string;
};

export type LivePayrollLineItem = {
  id: string;
  label: string;
  direction: "EARNING" | "DEDUCTION";
  amount: number;
  formula: string;
  sourceLabel: string;
};

export type LiveMonthlyPayrollRow = {
  workerId: string;
  employeeCode: string;
  workerName: string;
  workerType: string;
  locationCode: string | null;
  positionTitle: string | null;
  compensationType: CompensationType | null;
  compensationLabel: string;
  standardDays: number;
  approvedDays: number;
  pendingDays: number;
  approvedHours: number;
  pendingHours: number;
  overtimeHours: number;
  outputQuantity: number;
  pendingOutputQuantity: number;
  mealCount: number;
  basePay: number;
  pieceworkPay: number;
  overtimePay: number;
  mealAllowance: number;
  fixedAllowance: number;
  approvedBonus: number;
  manualBonus: number;
  grossPay: number;
  insuranceAmount: number;
  fixedDeduction: number;
  approvedPenalty: number;
  manualPenalty: number;
  approvedAdvance: number;
  manualAdvance: number;
  totalDeductions: number;
  netPay: number;
  bankName: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  bankVerified: boolean;
  paymentStatus: "UNPAID" | "PAID";
  paidAt: string | null;
  notes: string;
  lineItems: LivePayrollLineItem[];
};

const STORAGE_PREFIX = "crm-joliefam.live-payroll-overrides.v1:";

const compensationLabels: Record<string, string> = {
  MONTHLY_MANAGER: "Quản lý lương tháng",
  MONTHLY_HELPER: "Thợ phụ lương tháng",
  PIECE_RATE: "Thợ may sản phẩm",
  HOURLY: "Nhân viên theo giờ",
};

const workerTypeLabels: Record<string, string> = {
  SEWER: "Tổ May",
  SEWING: "Tổ May",
  CUTTER: "Tổ Cắt",
  CUTTING: "Tổ Cắt",
  IRONING: "Tổ Ủi / Hoàn thiện",
  FINISHING: "Hoàn thiện",
  QC: "Tổ Kiểm đếm (QC)",
  PACKER: "Tổ Đóng gói",
  HELPER: "Tổ Phụ trợ",
  SUPERVISOR: "Quản lý xưởng",
  OFFICE: "Văn phòng",
  GENERIC: "Khác",
};

export function formatTeamLabel(workerType: string | null | undefined, locationCode?: string | null): string {
  const base = workerType ? workerTypeLabels[workerType] || workerType : "Xưởng";
  if (locationCode && locationCode !== "__UNASSIGNED__") {
    return `${base} · ${locationCode}`;
  }
  return base;
}

export function loadMonthOverrides(monthKey: string): Record<string, InlineWorkerMonthOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${monthKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMonthOverrides(
  monthKey: string,
  overrides: Record<string, InlineWorkerMonthOverride>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${monthKey}`, JSON.stringify(overrides));
  } catch {
    // ignore storage quota errors
  }
}

export function updateWorkerMonthOverride(
  monthKey: string,
  workerId: string,
  patch: Partial<InlineWorkerMonthOverride>,
): Record<string, InlineWorkerMonthOverride> {
  const current = loadMonthOverrides(monthKey);
  const existing = current[workerId] || {};
  const next: Record<string, InlineWorkerMonthOverride> = {
    ...current,
    [workerId]: {
      ...existing,
      ...patch,
    },
  };
  saveMonthOverrides(monthKey, next);
  return next;
}

export function bulkSetMonthPaymentStatus(
  monthKey: string,
  workerIds: string[],
  status: "UNPAID" | "PAID",
): Record<string, InlineWorkerMonthOverride> {
  const current = loadMonthOverrides(monthKey);
  const next = { ...current };
  const nowIso = status === "PAID" ? new Date().toISOString() : null;
  for (const id of workerIds) {
    next[id] = {
      ...(next[id] || {}),
      paymentStatus: status,
      paidAt: nowIso,
    };
  }
  saveMonthOverrides(monthKey, next);
  return next;
}

function isEffectiveOn(effectiveFrom: string, effectiveTo: string | null | undefined, dateStr: string): boolean {
  return effectiveFrom <= dateStr && (!effectiveTo || effectiveTo >= dateStr);
}

function latestEffective<
  T extends {
    worker_id: string;
    status?: string;
    effective_from: string;
    effective_to?: string | null;
    created_at?: string;
  },
>(rows: T[], workerId: string, asOfDate: string): T | undefined {
  const approved = rows
    .filter(
      (r) =>
        r.worker_id === workerId &&
        (!r.status || r.status === "APPROVED" || r.status === "VERIFIED") &&
        isEffectiveOn(r.effective_from, r.effective_to, asOfDate),
    )
    .sort((a, b) =>
      `${b.effective_from}|${b.created_at || ""}`.localeCompare(`${a.effective_from}|${a.created_at || ""}`),
    );
  if (approved.length > 0) return approved[0];
  // Fallback to latest approved regardless of date if none covers periodEnd
  return rows
    .filter((r) => r.worker_id === workerId && (!r.status || r.status === "APPROVED" || r.status === "VERIFIED"))
    .sort((a, b) =>
      `${b.effective_from}|${b.created_at || ""}`.localeCompare(`${a.effective_from}|${a.created_at || ""}`),
    )[0];
}

export type LivePayrollSourceBundle = {
  monthKey: string;
  workers: PayrollWorker[];
  attendanceRows: FactoryAttendanceRow[];
  productionEntries: ProductionEntryRow[];
  overtimeRows: FactoryOvertimeRow[];
  dayStatuses: FactoryAttendanceDayStatusRow[];
  assignments: WorkerCompensationAssignment[];
  profiles: WorkerPayrollProfile[];
  workerRates: WorkerCompensationRate[];
  insuranceVersions: SocialInsuranceVersion[];
  bankAccounts: PayrollBankAccount[];
  adjustments: PayrollAdjustment[];
  calendars?: Record<string, unknown>[];
  ruleVersions?: Record<string, unknown>[];
  overrides: Record<string, InlineWorkerMonthOverride>;
};

export function computeLiveMonthlyPayroll(bundle: LivePayrollSourceBundle): LiveMonthlyPayrollRow[] {
  const {
    monthKey,
    workers,
    attendanceRows,
    productionEntries,
    overtimeRows,
    dayStatuses,
    assignments,
    profiles,
    workerRates,
    insuranceVersions,
    bankAccounts,
    adjustments,
    calendars = [],
    ruleVersions = [],
    overrides,
  } = bundle;

  const periodStart = `${monthKey}-01`;
  const lastDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const periodEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  // Active workers or workers who have records in the month
  const activeWorkerIdsWithActivity = new Set<string>();
  for (const r of attendanceRows) if (!r.is_reversed) activeWorkerIdsWithActivity.add(r.worker_id);
  for (const r of productionEntries) if (!r.is_reversed) activeWorkerIdsWithActivity.add(r.worker_id);
  for (const r of overtimeRows) activeWorkerIdsWithActivity.add(r.worker_id);
  for (const r of adjustments) {
    if (r.period_start <= periodEnd && r.period_end >= periodStart && r.status !== "REJECTED") {
      activeWorkerIdsWithActivity.add(r.worker_id);
    }
  }

  const eligibleWorkers = workers.filter(
    (w) =>
      (w.is_active && w.payroll_status === "ACTIVE") ||
      activeWorkerIdsWithActivity.has(w.id),
  );

  return eligibleWorkers.map((worker) => {
    const wid = worker.id;
    const loc = worker.location_code || "__UNASSIGNED__";

    const assignment = latestEffective(assignments, wid, periodEnd);
    const compensationType =
      assignment?.compensation_type ??
      worker.current_compensation_type ??
      worker.employment_type ??
      (worker.worker_type === "SEWER" ? "PIECE_RATE" : "MONTHLY_HELPER");

    const profile = latestEffective(profiles, wid, periodEnd);
    const primaryRateRow = workerRates
      .filter(
        (r) =>
          r.worker_id === wid &&
          r.status === "APPROVED" &&
          (!compensationType || r.compensation_type === compensationType),
      )
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

    const calendarRow = calendars.find(
      (c) =>
        c.status === "APPROVED" &&
        String(c.period_start).slice(0, 10) === periodStart &&
        String(c.period_end).slice(0, 10) === periodEnd &&
        (c.location_code === loc || c.location_code === "__UNASSIGNED__"),
    );

    const standardDays =
      Number(calendarRow?.standard_days) ||
      26;
    const standardDailyHours =
      (Number(calendarRow?.daily_minutes) ? Number(calendarRow?.daily_minutes) / 60 : 0) ||
      (primaryRateRow?.monthly_productive_minutes && standardDays > 0
        ? Number(primaryRateRow.monthly_productive_minutes) / standardDays / 60
        : 8);

    const workerAtt = attendanceRows.filter(
      (r) =>
        r.worker_id === wid &&
        !r.is_reversed &&
        r.work_date.slice(0, 7) === monthKey &&
        r.workflow_status !== "REJECTED",
    );

    let approvedDays = 0;
    let pendingDays = 0;
    let approvedHours = 0;
    let pendingHours = 0;
    let dayPaySum = 0;
    let hourPaySum = 0;

    const monthlyRateVal = Number(primaryRateRow?.monthly_rate ?? 0);
    const hourlyRateVal = Number(primaryRateRow?.hourly_rate ?? 0);

    for (const row of workerAtt) {
      const isApproved = !row.workflow_status || row.workflow_status === "APPROVED" || row.workflow_status === "LOCKED";
      if (row.attendance_method === "DAY") {
        const units = Number(row.day_units ?? 0);
        if (isApproved) approvedDays += units;
        else pendingDays += units;
        const snapSalary = Number(row.monthly_salary_snapshot ?? monthlyRateVal);
        const unitDayRate = standardDays > 0 ? snapSalary / standardDays : 0;
        if (isApproved || snapSalary > 0) {
          dayPaySum += units * unitDayRate;
        }
      } else if (row.attendance_method === "HOUR") {
        const mins = Number(row.worked_minutes ?? 0);
        const hrs = mins / 60;
        if (isApproved) approvedHours += hrs;
        else pendingHours += hrs;
        const unitHourRate = Number(row.rate_amount ?? hourlyRateVal);
        hourPaySum += hrs * unitHourRate;
      }
    }

    // If worker is MONTHLY_MANAGER / MONTHLY_HELPER and dayPaySum is 0 but has approved/pending days and monthlyRateVal
    if (
      (compensationType === "MONTHLY_MANAGER" || compensationType === "MONTHLY_HELPER") &&
      dayPaySum === 0 &&
      monthlyRateVal > 0 &&
      approvedDays + pendingDays > 0
    ) {
      dayPaySum = ((approvedDays + pendingDays) * monthlyRateVal) / standardDays;
    }

    const basePay = Math.round(
      compensationType === "HOURLY" ? hourPaySum : dayPaySum,
    );

    // Piecework
    const workerProd = productionEntries.filter(
      (r) =>
        r.worker_id === wid &&
        !r.is_reversed &&
        String(r.work_date).slice(0, 7) === monthKey &&
        r.workflow_status !== "REJECTED",
    );

    let outputQuantity = 0;
    let pendingOutputQuantity = 0;
    let pieceworkPay = 0;
    for (const p of workerProd) {
      const qty = Number(p.quantity ?? 0);
      const rate = Number(p.rate_amount ?? 0);
      const amt = Number(p.calculated_amount ?? qty * rate);
      if (!p.workflow_status || p.workflow_status === "APPROVED" || p.workflow_status === "LOCKED") {
        outputQuantity += qty;
      } else {
        pendingOutputQuantity += qty;
      }
      pieceworkPay += amt;
    }
    pieceworkPay = Math.round(pieceworkPay);

    // Overtime
    const workerOt = overtimeRows.filter(
      (r) =>
        r.worker_id === wid &&
        String(r.work_date).slice(0, 7) === monthKey &&
        r.status !== "REJECTED",
    );
    let overtimeMinutes = 0;
    let overtimePay = 0;
    const baseHourlyForOt =
      hourlyRateVal > 0
        ? hourlyRateVal
        : monthlyRateVal > 0 && standardDays > 0 && standardDailyHours > 0
          ? monthlyRateVal / standardDays / standardDailyHours
          : 0;

    for (const ot of workerOt) {
      const mins = Number(ot.overtime_minutes ?? 0);
      overtimeMinutes += mins;
      const hrs = mins / 60;
      const otType = String(ot.overtime_type || "NORMAL").toUpperCase().replace(/_OVERTIME$/, "");
      const matchingRule = ruleVersions.find(
        (rv) =>
          rv.status === "APPROVED" &&
          rv.rule_kind === "OT" &&
          String(rv.overtime_type || "NORMAL").toUpperCase() === otType,
      );
      if (matchingRule) {
        if (matchingRule.calculation_method === "FIXED_RATE" && Number(matchingRule.fixed_rate) > 0) {
          overtimePay += hrs * Number(matchingRule.fixed_rate);
        } else {
          const mult = Number(matchingRule.multiplier) || 1.5;
          overtimePay += hrs * baseHourlyForOt * mult;
        }
      } else {
        const defaultMult = otType === "HOLIDAY" ? 3 : otType === "SUNDAY" || otType === "WEEKEND" ? 2 : 1.5;
        overtimePay += hrs * baseHourlyForOt * defaultMult;
      }
    }
    overtimePay = Math.round(overtimePay);
    const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;

    // Meal allowance
    const mealDays = dayStatuses.filter(
      (d) =>
        d.worker_id === wid &&
        String(d.work_date).slice(0, 7) === monthKey &&
        d.status === "PRESENT" &&
        d.meal_eligible,
    ).length;
    const mealRule = ruleVersions.find((rv) => rv.status === "APPROVED" && rv.rule_kind === "MEAL");
    const mealUnitRate = Number(mealRule?.meal_rate ?? 0);
    const mealAllowance = profile?.meal_enabled ? Math.round(mealDays * mealUnitRate) : 0;

    // Fixed Allowance & Fixed Deduction from profile
    const fixedAllowance =
      profile?.allowances_enabled && Number(profile.fixed_allowance_amount) > 0
        ? Math.round(Number(profile.fixed_allowance_amount))
        : 0;
    const fixedDeduction =
      profile?.deductions_enabled && Number(profile.fixed_deduction_amount) > 0
        ? Math.round(Number(profile.fixed_deduction_amount))
        : 0;

    // Social Insurance
    const insVersion = latestEffective(insuranceVersions, wid, periodEnd);
    const insuranceAmount =
      (!profile || profile.insurance_enabled) && insVersion
        ? Math.round(Number(insVersion.employee_amount ?? 0))
        : 0;

    // Adjustments in month
    const monthAdjustments = adjustments.filter(
      (a) =>
        a.worker_id === wid &&
        a.period_start <= periodEnd &&
        a.period_end >= periodStart &&
        !["REJECTED"].includes(a.status),
    );

    let approvedBonus = 0;
    let approvedPenalty = 0;
    let approvedAdvance = 0;

    for (const adj of monthAdjustments) {
      const amt = Math.round(Number(adj.amount ?? 0));
      if (adj.item_direction === "EARNING") {
        approvedBonus += amt;
      } else if (adj.item_type === "SALARY_ADVANCE") {
        approvedAdvance += amt;
      } else {
        approvedPenalty += amt;
      }
    }

    const override = overrides[wid] || {};
    const manualBonus =
      override.manualBonus !== undefined ? Math.round(Number(override.manualBonus) || 0) : approvedBonus;
    const manualPenalty =
      override.manualPenalty !== undefined ? Math.round(Number(override.manualPenalty) || 0) : approvedPenalty;
    const manualAdvance =
      override.advanceAmount !== undefined ? Math.round(Number(override.advanceAmount) || 0) : approvedAdvance;

    const grossPay =
      basePay +
      pieceworkPay +
      overtimePay +
      mealAllowance +
      fixedAllowance +
      manualBonus;

    const totalDeductions =
      insuranceAmount +
      fixedDeduction +
      manualPenalty +
      manualAdvance;

    const netPay = grossPay - totalDeductions;

    // Bank account
    const workerBanks = bankAccounts
      .filter((b) => b.worker_id === wid && b.status !== "RETIRED")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.effective_from.localeCompare(a.effective_from));
    const primaryBank = workerBanks.find((b) => b.status === "VERIFIED") || workerBanks[0];

    const lineItems: LivePayrollLineItem[] = [];
    if (basePay > 0) {
      lineItems.push({
        id: "base",
        label: compensationType === "HOURLY" ? "Lương theo giờ" : "Lương ngày công",
        direction: "EARNING",
        amount: basePay,
        formula:
          compensationType === "HOURLY"
            ? `${(approvedHours + pendingHours).toFixed(1)} giờ × đơn giá giờ`
            : `${(approvedDays + pendingDays).toLocaleString("vi-VN")}/${standardDays} công`,
        sourceLabel: "Bảng chấm công",
      });
    }
    if (pieceworkPay > 0) {
      lineItems.push({
        id: "piecework",
        label: "Lương sản lượng may",
        direction: "EARNING",
        amount: pieceworkPay,
        formula: `${(outputQuantity + pendingOutputQuantity).toLocaleString("vi-VN")} sản phẩm × đơn giá mã Excel`,
        sourceLabel: "Phiếu sản lượng",
      });
    }
    if (overtimePay > 0) {
      lineItems.push({
        id: "overtime",
        label: "Lương tăng ca",
        direction: "EARNING",
        amount: overtimePay,
        formula: `${overtimeHours} giờ tăng ca`,
        sourceLabel: "Phiếu tăng ca",
      });
    }
    if (mealAllowance > 0) {
      lineItems.push({
        id: "meal",
        label: "Phụ cấp ăn ca",
        direction: "EARNING",
        amount: mealAllowance,
        formula: `${mealDays} suất × ${mealUnitRate.toLocaleString("vi-VN")} ₫`,
        sourceLabel: "Trạng thái ngày",
      });
    }
    if (fixedAllowance > 0) {
      lineItems.push({
        id: "fixed_allowance",
        label: "Phụ cấp cố định",
        direction: "EARNING",
        amount: fixedAllowance,
        formula: "Phụ cấp cố định theo kỳ",
        sourceLabel: "Hồ sơ lương",
      });
    }
    if (manualBonus > 0) {
      lineItems.push({
        id: "bonus",
        label: "Thưởng / Khoản cộng thêm",
        direction: "EARNING",
        amount: manualBonus,
        formula: "Thưởng & phụ cấp phát sinh trong tháng",
        sourceLabel: "Bảng lương tháng",
      });
    }
    if (insuranceAmount > 0) {
      lineItems.push({
        id: "insurance",
        label: "Bảo hiểm xã hội (BHXH)",
        direction: "DEDUCTION",
        amount: insuranceAmount,
        formula: "Mức đóng BHXH nhân viên",
        sourceLabel: "Cấu hình BHXH",
      });
    }
    if (fixedDeduction > 0) {
      lineItems.push({
        id: "fixed_deduction",
        label: "Khấu trừ cố định",
        direction: "DEDUCTION",
        amount: fixedDeduction,
        formula: "Khấu trừ cố định theo kỳ",
        sourceLabel: "Hồ sơ lương",
      });
    }
    if (manualPenalty > 0) {
      lineItems.push({
        id: "penalty",
        label: "Phạt / Khấu trừ khác",
        direction: "DEDUCTION",
        amount: manualPenalty,
        formula: "Khoản phạt / trừ phát sinh trong tháng",
        sourceLabel: "Bảng lương tháng",
      });
    }
    if (manualAdvance > 0) {
      lineItems.push({
        id: "advance",
        label: "Tạm ứng lương",
        direction: "DEDUCTION",
        amount: manualAdvance,
        formula: "Trừ tạm ứng trong kỳ",
        sourceLabel: "Bảng lương tháng",
      });
    }

    return {
      workerId: wid,
      employeeCode: worker.employee_code,
      workerName: worker.display_name,
      workerType: worker.worker_type,
      locationCode: worker.location_code,
      positionTitle: worker.position_title,
      compensationType: (compensationType as CompensationType) || null,
      compensationLabel: compensationType
        ? compensationLabels[compensationType] || compensationType
        : "Chưa phân loại",
      standardDays,
      approvedDays,
      pendingDays,
      approvedHours: Math.round(approvedHours * 100) / 100,
      pendingHours: Math.round(pendingHours * 100) / 100,
      overtimeHours,
      outputQuantity,
      pendingOutputQuantity,
      mealCount: mealDays,
      basePay,
      pieceworkPay,
      overtimePay,
      mealAllowance,
      fixedAllowance,
      approvedBonus,
      manualBonus,
      grossPay,
      insuranceAmount,
      fixedDeduction,
      approvedPenalty,
      manualPenalty,
      approvedAdvance,
      manualAdvance,
      totalDeductions,
      netPay,
      bankName: primaryBank?.bank_name ?? null,
      bankCode: primaryBank?.bank_code ?? null,
      bankAccountNumber: primaryBank?.account_number ?? null,
      bankAccountHolder: primaryBank?.account_name ?? null,
      bankVerified: primaryBank?.status === "VERIFIED",
      paymentStatus: override.paymentStatus ?? "UNPAID",
      paidAt: override.paidAt ?? null,
      notes: override.notes ?? "",
      lineItems,
    };
  });
}

export async function exportLiveMonthlyPayrollExcel(
  rows: readonly LiveMonthlyPayrollRow[],
  monthKey: string,
): Promise<{ filename: string }> {
  if (!rows.length) throw new Error("Không có dữ liệu bảng lương để xuất Excel.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Joliefam";
  const sheet = workbook.addWorksheet(`Bang luong ${monthKey}`);

  sheet.columns = [
    { header: "STT", key: "stt", width: 7 },
    { header: "Mã NV", key: "code", width: 14 },
    { header: "Họ và tên", key: "name", width: 26 },
    { header: "Tổ / Bộ phận", key: "team", width: 18 },
    { header: "Hình thức lương", key: "comp", width: 20 },
    { header: "Ngày công / Giờ", key: "attendance", width: 16 },
    { header: "Sản lượng (SP)", key: "output", width: 15 },
    { header: "Lương cơ bản / Công", key: "basePay", width: 18 },
    { header: "Lương sản phẩm", key: "pieceworkPay", width: 18 },
    { header: "Phụ cấp & Tăng ca", key: "allowances", width: 18 },
    { header: "Thưởng thêm", key: "bonus", width: 16 },
    { header: "Tổng thu nhập", key: "gross", width: 18 },
    { header: "BHXH & Cố định", key: "insurance", width: 16 },
    { header: "Phạt / Trừ khác", key: "penalty", width: 16 },
    { header: "Tạm ứng", key: "advance", width: 16 },
    { header: "Thực lĩnh", key: "net", width: 20 },
    { header: "Ngân hàng", key: "bank", width: 18 },
    { header: "Số tài khoản", key: "accountNo", width: 20 },
    { header: "Chủ tài khoản", key: "accountHolder", width: 24 },
    { header: "Trạng thái trả", key: "status", width: 16 },
  ];

  const moneyCols = ["basePay", "pieceworkPay", "allowances", "bonus", "gross", "insurance", "penalty", "advance", "net"];
  for (const key of moneyCols) {
    sheet.getColumn(key).numFmt = "#,##0";
  }

  rows.forEach((row, index) => {
    const totalDays = row.approvedDays + row.pendingDays;
    const totalHours = row.approvedHours + row.pendingHours;
    const attendanceText =
      row.compensationType === "HOURLY"
        ? `${totalHours.toFixed(1)} giờ`
        : `${totalDays.toLocaleString("vi-VN")}/${row.standardDays} ngày`;

    sheet.addRow({
      stt: index + 1,
      code: row.employeeCode,
      name: row.workerName,
      team: formatTeamLabel(row.workerType, row.locationCode),
      comp: row.compensationLabel,
      attendance: attendanceText,
      output: row.outputQuantity + row.pendingOutputQuantity,
      basePay: row.basePay,
      pieceworkPay: row.pieceworkPay,
      allowances: row.overtimePay + row.mealAllowance + row.fixedAllowance,
      bonus: row.manualBonus,
      gross: row.grossPay,
      insurance: row.insuranceAmount + row.fixedDeduction,
      penalty: row.manualPenalty,
      advance: row.manualAdvance,
      net: row.netPay,
      bank: row.bankName || "",
      accountNo: row.bankAccountNumber || "",
      accountHolder: row.bankAccountHolder || "",
      status: row.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa trả",
    });
  });

  // Total row
  const totalRow = sheet.addRow({
    stt: "",
    code: "",
    name: "TỔNG CỘNG",
    team: "",
    comp: "",
    attendance: "",
    output: rows.reduce((s, r) => s + r.outputQuantity + r.pendingOutputQuantity, 0),
    basePay: rows.reduce((s, r) => s + r.basePay, 0),
    pieceworkPay: rows.reduce((s, r) => s + r.pieceworkPay, 0),
    allowances: rows.reduce((s, r) => s + r.overtimePay + r.mealAllowance + r.fixedAllowance, 0),
    bonus: rows.reduce((s, r) => s + r.manualBonus, 0),
    gross: rows.reduce((s, r) => s + r.grossPay, 0),
    insurance: rows.reduce((s, r) => s + r.insuranceAmount + r.fixedDeduction, 0),
    penalty: rows.reduce((s, r) => s + r.manualPenalty, 0),
    advance: rows.reduce((s, r) => s + r.manualAdvance, 0),
    net: rows.reduce((s, r) => s + r.netPay, 0),
    bank: "",
    accountNo: "",
    accountHolder: "",
    status: "",
  });
  totalRow.font = { bold: true };

  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const filename = `bang-luong-thang-${monthKey}.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
  return { filename };
}

export async function exportBankTransferExcel(
  rows: readonly LiveMonthlyPayrollRow[],
  monthKey: string,
): Promise<{ filename: string }> {
  if (!rows.length) throw new Error("Không có dữ liệu để xuất ủy nhiệm chi ngân hàng.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Joliefam";
  const sheet = workbook.addWorksheet(`Uy nhiem chi ${monthKey}`);

  sheet.columns = [
    { header: "STT", key: "stt", width: 8 },
    { header: "Mã NV", key: "code", width: 15 },
    { header: "Họ và tên", key: "name", width: 26 },
    { header: "Chủ tài khoản", key: "holder", width: 26 },
    { header: "Số tài khoản", key: "accountNo", width: 22 },
    { header: "Ngân hàng", key: "bankName", width: 22 },
    { header: "Mã NH", key: "bankCode", width: 12 },
    { header: "Số tiền thực lĩnh (VNĐ)", key: "amount", width: 22 },
    { header: "Nội dung chuyển khoản", key: "content", width: 36 },
    { header: "Trạng thái", key: "status", width: 16 },
  ];

  sheet.getColumn("amount").numFmt = "#,##0";

  rows.forEach((row, index) => {
    sheet.addRow({
      stt: index + 1,
      code: row.employeeCode,
      name: row.workerName,
      holder: row.bankAccountHolder || row.workerName,
      accountNo: row.bankAccountNumber || "Chưa cập nhật",
      bankName: row.bankName || "Chưa cập nhật",
      bankCode: row.bankCode || "",
      amount: Math.max(0, row.netPay),
      content: `Thanh toan luong thang ${monthKey} - ${row.employeeCode} ${row.workerName}`,
      status: row.paymentStatus === "PAID" ? "Đã trả" : "Chưa trả",
    });
  });

  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const filename = `uy-nhiem-chi-luong-${monthKey}.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
  return { filename };
}

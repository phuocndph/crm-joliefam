import type { AttendanceMethod, FactoryAttendanceRow } from "@/integrations/supabase/production-execution-types";

export type WorkedTimeResult = {
  minutes: number;
  error: string | null;
};

export type AttendanceTotals = {
  day: number;
  hour: number;
  output: number;
  cost: number;
};

type AttendanceTotalOptions = {
  /** Include submitted records in operational totals. Rejected records never count. */
  includePending?: boolean;
};

function workflowStatus(row: FactoryAttendanceRow) {
  return row.workflow_status ?? "APPROVED";
}

function countsTowardTotals(row: FactoryAttendanceRow, includePending: boolean) {
  if (row.is_reversed || workflowStatus(row) === "REJECTED") return false;
  if (includePending || row.source_type === "PRODUCTION_LEGACY") return true;
  return workflowStatus(row) === "APPROVED" || workflowStatus(row) === "LOCKED";
}

function parseClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function calculateWorkedMinutes(
  checkInTime: string,
  checkOutTime: string,
  breakMinutesValue: string,
): WorkedTimeResult {
  const startMinutes = parseClock(checkInTime);
  const endMinutes = parseClock(checkOutTime);
  const breakMinutes = Number(breakMinutesValue);

  if (
    startMinutes === null
    || endMinutes === null
    || !Number.isFinite(breakMinutes)
    || !Number.isInteger(breakMinutes)
    || breakMinutes < 0
  ) {
    return { minutes: 0, error: "Hãy nhập giờ hợp lệ, giờ về và thời gian nghỉ hợp lệ." };
  }
  if (endMinutes <= startMinutes) {
    return { minutes: 0, error: "Giờ về phải sau giờ đến trong cùng ngày." };
  }

  const grossMinutes = endMinutes - startMinutes;
  if (breakMinutes >= grossMinutes) {
    return { minutes: 0, error: "Thời gian nghỉ phải ngắn hơn tổng thời gian có mặt." };
  }
  return { minutes: grossMinutes - breakMinutes, error: null };
}

export function workedHoursForAttendance(row: FactoryAttendanceRow) {
  if (row.work_hours && row.work_hours > 0) return row.work_hours;
  const start = row.check_in_time ? parseClock(row.check_in_time.slice(0, 5)) : null;
  const end = row.check_out_time ? parseClock(row.check_out_time.slice(0, 5)) : null;
  if (start === null || end === null || end <= start) return 0;
  return Math.max(0, (end - start - Math.max(0, row.break_minutes ?? 0)) / 60);
}

export function attendanceTotals(rows: FactoryAttendanceRow[], options: AttendanceTotalOptions = {}): AttendanceTotals {
  const includePending = options.includePending ?? true;
  return rows.filter((row) => countsTowardTotals(row, includePending)).reduce<AttendanceTotals>((totals, row) => ({
    day: totals.day + (row.day_units ?? 0),
    hour: totals.hour + workedHoursForAttendance(row),
    output: totals.output + (row.output_quantity ?? 0),
    cost: totals.cost + (row.calculated_amount ?? 0),
  }), { day: 0, hour: 0, output: 0, cost: 0 });
}

export function attendancePostedTotals(rows: FactoryAttendanceRow[]) {
  return attendanceTotals(rows, { includePending: false });
}

export function attendancePendingCount(rows: FactoryAttendanceRow[]) {
  return rows.filter((row) => !row.is_reversed && workflowStatus(row) === "SUBMITTED").length;
}

export function attendanceRejectedCount(rows: FactoryAttendanceRow[]) {
  return rows.filter((row) => !row.is_reversed && workflowStatus(row) === "REJECTED").length;
}

export function attendanceMetricForDay(rows: FactoryAttendanceRow[], method: AttendanceMethod) {
  const totals = attendanceTotals(rows);
  if (method === "DAY") return totals.day;
  if (method === "OUTPUT") return totals.output;
  return totals.hour;
}

export function attendanceMethodSummary(rows: FactoryAttendanceRow[], method: AttendanceMethod) {
  const activeRows = rows.filter((row) => countsTowardTotals(row, true));
  const totals = attendanceTotals(activeRows);
  const value = method === "DAY" ? totals.day : method === "OUTPUT" ? totals.output : totals.hour;
  const unit = method === "DAY" ? "ngày" : method === "OUTPUT" ? "SP" : "giờ";
  const label = method === "DAY" ? "Ngày công" : method === "OUTPUT" ? "Sản lượng" : "Giờ làm";
  return { value, unit, label, count: activeRows.length, totals };
}

// Shared by the master PATCH, profile bundle and NHAN_SU workbook transaction.
const invalid = (message: string) => Object.assign(new Error(message), { status: 422 });
export const workerMasterFields = [
  ["location_code", "locationCode"], ["position_title", "positionTitle"],
  ["employment_start_date", "employmentStartDate"], ["employment_end_date", "employmentEndDate"],
  ["payroll_status", "payrollStatus"],
] as const;
export function workerMasterPatch(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(workerMasterFields.flatMap(([snake, camel]) =>
    Object.prototype.hasOwnProperty.call(body, snake) ? [[snake, body[snake]]] :
    Object.prototype.hasOwnProperty.call(body, camel) ? [[snake, body[camel]]] : []));
}
export function validateWorkerMaster<T extends Record<string, unknown>>(master: T): T & {employment_start_date:string|null;employment_end_date:string|null} {
  const date = (value: unknown, label: string): string | null => {
    if (value == null) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-") || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0,10) !== value)
      throw invalid(`${label} phải là ngày hợp lệ theo định dạng YYYY-MM-DD hoặc null.`);
    return value;
  };
  const start = date(master.employment_start_date, "Ngày vào làm");
  const end = date(master.employment_end_date, "Ngày nghỉ việc");
  if (typeof master.payroll_status !== "string" || !["ACTIVE", "SUSPENDED", "TERMINATED"].includes(master.payroll_status)) throw invalid("Trạng thái lương không hợp lệ.");
  if (start && end && end < start) throw invalid("Ngày nghỉ việc không được trước ngày vào làm.");
  if (master.payroll_status === "TERMINATED" && !end) throw invalid("Nhân sự đã nghỉ việc cần có ngày nghỉ việc.");
  return { ...master, employment_start_date: start, employment_end_date: end };
}
export function requireWorkerMasterReason(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw invalid("Cần ghi rõ lý do thay đổi hồ sơ nhân sự.");
  return value.trim();
}

import type {
  AttendanceClosureStatus,
  AttendanceMethod,
  AttendanceWorkflowStatus,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceRow,
  FactoryOvertimeRow,
  ProductionEntryRow,
  WorkerType,
} from "@/integrations/supabase/production-execution-types";
import type { Worksheet } from "exceljs";

type ExportWorker = {
  worker_id: string;
  employee_code: string;
  worker_name: string;
  worker_type: WorkerType;
};

type ExportInput = {
  month: string;
  workers: ExportWorker[];
  rows: FactoryAttendanceRow[];
  dayStatuses: FactoryAttendanceDayStatusRow[];
  overtimeRows: FactoryOvertimeRow[];
  closures: FactoryAttendanceClosureRow[];
  productionEntries?: ProductionEntryRow[];
  filters?: {
    workerLabel?: string;
    methodLabel?: string;
    workflowLabel?: string;
  };
};

const methodLabels: Record<AttendanceMethod, string> = {
  DAY: "Theo ngày",
  HOUR: "Theo giờ",
  OUTPUT: "Theo sản lượng",
};

const workflowLabels: Record<AttendanceWorkflowStatus, string> = {
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  LOCKED: "Đã khóa",
  REVERSED: "Đã đảo",
};

const statusLabels: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  PAID_LEAVE: "Nghỉ phép hưởng lương",
  UNPAID_LEAVE: "Nghỉ không lương",
  HOLIDAY: "Ngày lễ",
  OFF: "Nghỉ",
};

const overtimeLabels: Record<string, string> = {
  NORMAL_OVERTIME: "Tăng ca ngày thường",
  SUNDAY_OVERTIME: "Tăng ca Chủ nhật",
  HOLIDAY_OVERTIME: "Tăng ca ngày lễ",
};

const closureLabels: Record<AttendanceClosureStatus, string> = {
  OPEN: "Chưa chốt",
  EMPLOYEE_CONFIRMED: "Nhân sự đã chốt",
  LEADER_CONFIRMED: "Quản lý đã chốt",
  REOPENED: "Đã mở lại",
};

const workerTypeLabels: Record<WorkerType, string> = {
  CUTTER: "Thợ cắt",
  SEWER: "Thợ may",
  IRONING: "Thợ là",
  QC: "Kiểm hàng",
  PACKER: "Đóng gói",
  HELPER: "Thợ phụ",
  SUPERVISOR: "Quản lý",
  GENERIC: "Bán thời gian / Khác",
};

function safeText(value: unknown) {
  const text = value == null ? "" : String(value);
  // Prevent spreadsheet formula injection when a user-controlled field starts
  // with a formula character. Excel displays the value without the prefix.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function dateText(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : safeText(value);
}

function workflowText(row: FactoryAttendanceRow) {
  return workflowLabels[row.workflow_status ?? (row.is_reversed ? "REVERSED" : "APPROVED")];
}

function amountForExport(row: FactoryAttendanceRow) {
  return row.cost_visible ? row.calculated_amount : null;
}

function methodValue(row: FactoryAttendanceRow) {
  if (row.attendance_method === "DAY") return row.day_units ?? 0;
  if (row.attendance_method === "OUTPUT") return row.output_quantity ?? 0;
  return row.work_hours ?? 0;
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "" : Number(value);
}

function groupByWorker<T extends { worker_id: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const workerItems = grouped.get(item.worker_id) ?? [];
    workerItems.push(item);
    grouped.set(item.worker_id, workerItems);
  });
  return grouped;
}

function styleHeader(row: { eachCell: (callback: (cell: { font: object; fill: object; alignment: object; border: object }) => void) => void }) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
}

function styleDataRows(sheet: { eachRow: (callback: (row: { eachCell: (callback: (cell: { border: object; alignment: object }) => void) => void }, rowNumber: number) => void) => void }) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
}

function addTitle(sheet: Worksheet, title: string, subtitle: string) {
  sheet.addRow([title]);
  sheet.addRow([subtitle]);
  const tableColumnCount = Math.max(1, sheet.columns.length);
  sheet.mergeCells(1, 1, 1, tableColumnCount);
  sheet.mergeCells(2, 1, 2, tableColumnCount);
  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: "FF064E3B" } };
  sheet.getRow(2).font = { italic: true, color: { argb: "FF4B5563" } };
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 20;
}

export async function buildFactoryAttendanceWorkbook(input: ExportInput) {
  const excelJsModule = await import("exceljs");
  const ExcelWorkbook = excelJsModule.Workbook
    ?? (excelJsModule.default as typeof excelJsModule | undefined)?.Workbook;
  if (!ExcelWorkbook) throw new Error("Không thể khởi tạo bộ xuất Excel.");
  const workbook = new ExcelWorkbook();
  workbook.creator = "CRM Gia Lộc Hưng Phát";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const monthLabel = input.month.replace("-", "/");
  const filterLabel = [input.filters?.workerLabel, input.filters?.methodLabel, input.filters?.workflowLabel]
    .filter(Boolean)
    .join(" · ") || "Tất cả dữ liệu trong phạm vi quyền truy cập";

  const workerDirectory = new Map(input.workers.map((worker) => [worker.worker_id, worker]));
  input.rows.forEach((row) => workerDirectory.set(row.worker_id, {
    worker_id: row.worker_id,
    employee_code: row.employee_code,
    worker_name: row.worker_name,
    worker_type: row.worker_type,
  }));
  input.dayStatuses.forEach((row) => workerDirectory.set(row.worker_id, {
    worker_id: row.worker_id,
    employee_code: row.employee_code,
    worker_name: row.worker_name,
    worker_type: row.worker_type,
  }));
  input.overtimeRows.forEach((row) => workerDirectory.set(row.worker_id, {
    worker_id: row.worker_id,
    employee_code: row.employee_code,
    worker_name: row.worker_name,
    worker_type: row.worker_type,
  }));
  (input.productionEntries ?? []).forEach((row) => workerDirectory.set(row.worker_id, {
    worker_id: row.worker_id,
    employee_code: row.employee_code,
    worker_name: row.worker_name,
    worker_type: row.worker_type,
  }));
  input.closures.forEach((row) => {
    if (!workerDirectory.has(row.worker_id)) {
      workerDirectory.set(row.worker_id, {
        worker_id: row.worker_id,
        employee_code: row.worker_id,
        worker_name: "Nhân sự không còn trong danh sách",
        worker_type: "GENERIC",
      });
    }
  });

  const orderedWorkers = [...workerDirectory.values()]
    .sort((a, b) => a.worker_name.localeCompare(b.worker_name, "vi"));
  const attendanceByWorker = groupByWorker(input.rows);
  const dayStatusByWorker = groupByWorker(input.dayStatuses);
  const overtimeByWorker = groupByWorker(input.overtimeRows);
  const productionByWorker = groupByWorker(input.productionEntries ?? []);
  const closureByWorker = groupByWorker(input.closures);

  const summary = workbook.addWorksheet("Tổng hợp");
  const summaryColumns = [
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Vị trí", key: "type", width: 20 },
    { header: "Ngày công", key: "day", width: 14 },
    { header: "Giờ công", key: "hour", width: 14 },
    { header: "Sản lượng", key: "output", width: 14 },
    { header: "Có mặt", key: "present", width: 11 },
    { header: "Vắng", key: "absent", width: 10 },
    { header: "Nghỉ phép", key: "paidLeave", width: 12 },
    { header: "Nghỉ không lương", key: "unpaidLeave", width: 16 },
    { header: "Ngày lễ", key: "holiday", width: 10 },
    { header: "Ngày nghỉ", key: "off", width: 11 },
    { header: "Ngày đủ tiền ăn", key: "meal", width: 15 },
    { header: "Tăng ca duyệt (phút)", key: "approvedOvertime", width: 19 },
    { header: "Tăng ca chờ duyệt (phút)", key: "pendingOvertime", width: 22 },
    { header: "Chi phí đã duyệt", key: "cost", width: 18 },
    { header: "Công chờ duyệt", key: "pending", width: 15 },
    { header: "Công từ chối", key: "rejected", width: 13 },
    { header: "Ngày quản lý đã chốt", key: "closedDays", width: 20 },
  ];
  summary.columns = summaryColumns.map(({ key, width }) => ({ key, width }));
  addTitle(summary, `BẢNG TỔNG HỢP CHẤM CÔNG THÁNG ${monthLabel}`, `Bộ lọc: ${filterLabel}. Chi phí chỉ bao gồm bản ghi đã duyệt/khóa và có quyền xem.`);
  summary.addRow([]);
  summary.addRow(summaryColumns.map((column) => column.header));
  styleHeader(summary.getRow(4));

  for (const worker of orderedWorkers) {
    const workerRows = attendanceByWorker.get(worker.worker_id) ?? [];
    const workerDayStatuses = dayStatusByWorker.get(worker.worker_id) ?? [];
    const workerOvertime = overtimeByWorker.get(worker.worker_id) ?? [];
    const workerProduction = productionByWorker.get(worker.worker_id) ?? [];
    const workerClosures = closureByWorker.get(worker.worker_id) ?? [];
    const activeRows = workerRows.filter((row) => !row.is_reversed && (row.workflow_status ?? "APPROVED") !== "REJECTED");
    const postedRows = activeRows.filter((row) => (row.workflow_status ?? "APPROVED") === "APPROVED" || (row.workflow_status ?? "APPROVED") === "LOCKED");
    const postedProduction = workerProduction.filter((row) => row.workflow_status === "APPROVED");
    const costRows = [...postedRows, ...postedProduction];
    const approvedOvertime = workerOvertime.filter((row) => row.status === "APPROVED" || row.status === "LOCKED");
    summary.addRow({
      code: safeText(worker.employee_code),
      name: safeText(worker.worker_name),
      type: workerTypeLabels[worker.worker_type],
      day: activeRows.reduce((sum, row) => sum + (row.day_units ?? 0), 0),
      hour: activeRows.reduce((sum, row) => sum + (row.work_hours ?? 0), 0),
      output: activeRows.reduce((sum, row) => sum + (row.output_quantity ?? 0), 0) + workerProduction.filter((row) => row.workflow_status !== "REJECTED" && row.workflow_status !== "REVERSED").reduce((sum, row) => sum + row.quantity, 0),
      present: workerDayStatuses.filter((row) => row.status === "PRESENT").length,
      absent: workerDayStatuses.filter((row) => row.status === "ABSENT").length,
      paidLeave: workerDayStatuses.filter((row) => row.status === "PAID_LEAVE").length,
      unpaidLeave: workerDayStatuses.filter((row) => row.status === "UNPAID_LEAVE").length,
      holiday: workerDayStatuses.filter((row) => row.status === "HOLIDAY").length,
      off: workerDayStatuses.filter((row) => row.status === "OFF").length,
      meal: workerDayStatuses.filter((row) => row.meal_eligible).length,
      approvedOvertime: approvedOvertime.reduce((sum, row) => sum + row.overtime_minutes, 0),
      pendingOvertime: workerOvertime
        .filter((row) => row.status === "SUBMITTED")
        .reduce((sum, row) => sum + row.overtime_minutes, 0),
      cost: costRows.length > 0 && costRows.every((row) => row.cost_visible)
        ? postedRows.reduce((sum, row) => sum + (row.calculated_amount ?? 0), 0) + postedProduction.reduce((sum, row) => sum + (row.calculated_amount ?? 0), 0)
        : "",
      pending: activeRows.filter((row) => (row.workflow_status ?? "APPROVED") === "SUBMITTED").length + workerProduction.filter((row) => row.workflow_status === "SUBMITTED").length,
      rejected: workerRows.filter((row) => !row.is_reversed && (row.workflow_status ?? "APPROVED") === "REJECTED").length + workerProduction.filter((row) => row.workflow_status === "REJECTED").length,
      closedDays: workerClosures.filter((row) => row.status === "LEADER_CONFIRMED").length,
    });
  }
  if (!orderedWorkers.length) summary.addRow(["Không có dữ liệu"]);
  summary.getColumn("cost").numFmt = '#,##0';
  summary.getColumn("day").numFmt = "0.##";
  summary.getColumn("hour").numFmt = "0.##";
  summary.getColumn("output").numFmt = "0.##";
  summary.views = [{ state: "frozen", ySplit: 4 }];
  summary.getColumn("approvedOvertime").numFmt = "0";
  summary.getColumn("pendingOvertime").numFmt = "0";
  summary.autoFilter = { from: "A4", to: "S4" };
  styleDataRows(summary);

  const detail = workbook.addWorksheet("Chi tiết");
  const detailColumns = [
    { header: "Ngày", key: "date", width: 13 },
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Vị trí", key: "type", width: 18 },
    { header: "Nguồn", key: "source", width: 16 },
    { header: "Hình thức", key: "method", width: 18 },
    { header: "Công việc", key: "activity", width: 30 },
    { header: "Giờ đến", key: "checkIn", width: 11 },
    { header: "Giờ về", key: "checkOut", width: 11 },
    { header: "Nghỉ (phút)", key: "break", width: 12 },
    { header: "Khối lượng", key: "value", width: 14 },
    { header: "Đơn giá", key: "rate", width: 14 },
    { header: "Thành tiền", key: "amount", width: 16 },
    { header: "Quy trình duyệt", key: "workflow", width: 14 },
    { header: "Đã đảo", key: "reversed", width: 10 },
    { header: "Ước tính", key: "estimated", width: 10 },
    { header: "Ghi chú", key: "notes", width: 32 },
  ];
  detail.columns = detailColumns.map(({ key, width }) => ({ key, width }));
  addTitle(detail, `CHI TIẾT CHẤM CÔNG THÁNG ${monthLabel}`, `Bộ lọc: ${filterLabel}`);
  detail.addRow([]);
  detail.addRow(detailColumns.map((column) => column.header));
  styleHeader(detail.getRow(4));
  input.rows.forEach((row) => detail.addRow({
    date: dateText(row.work_date),
    code: safeText(row.employee_code),
    name: safeText(row.worker_name),
    type: workerTypeLabels[row.worker_type],
    source: row.source_type === "FACTORY" ? "Xưởng" : "Lịch sử lệnh",
    method: methodLabels[row.attendance_method],
    activity: safeText(row.activity_name || row.operation_name || "Công việc xưởng"),
    checkIn: row.check_in_time?.slice(0, 5) ?? "",
    checkOut: row.check_out_time?.slice(0, 5) ?? "",
    break: row.break_minutes || "",
    value: methodValue(row),
    rate: formatNumber(row.cost_visible ? row.rate_amount : null),
    amount: formatNumber(amountForExport(row)),
    workflow: workflowText(row),
    reversed: row.is_reversed ? "Có" : "Không",
    estimated: row.is_estimated ? "Có" : "Không",
    notes: safeText(row.is_reversed ? row.reversal_reason || row.notes : row.notes),
  }));
  if (!input.rows.length) detail.addRow(["Không có dữ liệu"]);
  detail.getColumn("value").numFmt = "0.##";
  detail.getColumn("rate").numFmt = '#,##0.##';
  detail.getColumn("amount").numFmt = '#,##0.##';
  detail.views = [{ state: "frozen", ySplit: 4 }];
  detail.autoFilter = { from: "A4", to: "Q4" };
  styleDataRows(detail);

  const production = workbook.addWorksheet("Sản lượng");
  const productionColumns = [
    { header: "Ngày", key: "date", width: 13 },
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Tổ", key: "type", width: 18 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Sản phẩm", key: "product", width: 32 },
    { header: "Số lượng", key: "quantity", width: 14 },
    { header: "Đơn vị", key: "unit", width: 12 },
    { header: "Đơn giá", key: "rate", width: 14 },
    { header: "Thành tiền", key: "amount", width: 16 },
    { header: "Quy trình duyệt", key: "workflow", width: 14 },
    { header: "Ghi chú", key: "notes", width: 32 },
  ];
  production.columns = productionColumns.map(({ key, width }) => ({ key, width }));
  addTitle(production, `SẢN LƯỢNG THEO SẢN PHẨM THÁNG ${monthLabel}`, `Đơn giá được chốt theo ngày ghi nhận; chi phí chỉ hiển thị khi bản ghi đã duyệt và được phép xem.`);
  production.addRow([]);
  production.addRow(productionColumns.map((column) => column.header));
  styleHeader(production.getRow(4));
  (input.productionEntries ?? []).forEach((row) => production.addRow({
    date: dateText(row.work_date),
    code: safeText(row.employee_code),
    name: safeText(row.worker_name),
    type: workerTypeLabels[row.worker_type],
    sku: safeText(row.product_sku),
    product: safeText(row.product_name),
    quantity: row.quantity,
    unit: row.rate_unit === "SET" ? "Bộ" : "SP",
    rate: formatNumber(row.cost_visible ? row.rate_amount : null),
    amount: formatNumber(row.cost_visible ? row.calculated_amount : null),
    workflow: workflowLabels[row.workflow_status] ?? safeText(row.workflow_status),
    notes: safeText(row.notes),
  }));
  if (!(input.productionEntries ?? []).length) production.addRow(["Không có dữ liệu"]);
  production.getColumn("quantity").numFmt = "0.##";
  production.getColumn("rate").numFmt = "#,##0.##";
  production.getColumn("amount").numFmt = "#,##0.##";
  production.views = [{ state: "frozen", ySplit: 4 }];
  production.autoFilter = { from: "A4", to: "L4" };
  styleDataRows(production);

  const statusSheet = workbook.addWorksheet("Trạng thái ngày");
  const statusColumns = [
    { header: "Ngày", key: "date", width: 13 },
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Trạng thái", key: "status", width: 24 },
    { header: "Tiền ăn", key: "meal", width: 14 },
    { header: "Lý do", key: "reason", width: 40 },
    { header: "Cập nhật", key: "created", width: 22 },
  ];
  statusSheet.columns = statusColumns.map(({ key, width }) => ({ key, width }));
  addTitle(statusSheet, `TRẠNG THÁI NGÀY CÔNG THÁNG ${monthLabel}`, `Bao gồm ngày có mặt, vắng, nghỉ phép, nghỉ không lương, ngày lễ và ngày nghỉ.`);
  statusSheet.addRow([]);
  statusSheet.addRow(statusColumns.map((column) => column.header));
  styleHeader(statusSheet.getRow(4));
  input.dayStatuses.forEach((row) => statusSheet.addRow({
    date: dateText(row.work_date),
    code: safeText(row.employee_code),
    name: safeText(row.worker_name),
    status: statusLabels[row.status] ?? safeText(row.status),
    meal: row.meal_eligible ? "Đủ điều kiện" : "Không",
    reason: safeText(row.reason),
    created: row.created_at ? new Date(row.created_at).toLocaleString("vi-VN") : "",
  }));
  if (!input.dayStatuses.length) statusSheet.addRow(["Không có dữ liệu"]);
  statusSheet.views = [{ state: "frozen", ySplit: 4 }];
  statusSheet.autoFilter = { from: "A4", to: "G4" };
  styleDataRows(statusSheet);

  const overtime = workbook.addWorksheet("Tăng ca");
  const overtimeColumns = [
    { header: "Ngày", key: "date", width: 13 },
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Loại tăng ca", key: "type", width: 24 },
    { header: "Số phút", key: "minutes", width: 12 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Lý do", key: "reason", width: 40 },
    { header: "Cập nhật", key: "created", width: 22 },
  ];
  overtime.columns = overtimeColumns.map(({ key, width }) => ({ key, width }));
  addTitle(overtime, `TĂNG CA THÁNG ${monthLabel}`, `Tiền tăng ca chưa được tính trong bảng này; Payroll Engine sẽ áp chính sách sau khi duyệt.`);
  overtime.addRow([]);
  overtime.addRow(overtimeColumns.map((column) => column.header));
  styleHeader(overtime.getRow(4));
  input.overtimeRows.forEach((row) => overtime.addRow({
    date: dateText(row.work_date),
    code: safeText(row.employee_code),
    name: safeText(row.worker_name),
    type: overtimeLabels[row.overtime_type] ?? safeText(row.overtime_type),
    minutes: row.overtime_minutes,
    status: workflowLabels[row.status] ?? safeText(row.status),
    reason: safeText(row.reason),
    created: row.created_at ? new Date(row.created_at).toLocaleString("vi-VN") : "",
  }));
  if (!input.overtimeRows.length) overtime.addRow(["Không có dữ liệu"]);
  overtime.views = [{ state: "frozen", ySplit: 4 }];
  overtime.autoFilter = { from: "A4", to: "H4" };
  styleDataRows(overtime);

  const closureSheet = workbook.addWorksheet("Chốt ngày");
  const closureColumns = [
    { header: "Ngày", key: "date", width: 13 },
    { header: "Mã nhân sự", key: "code", width: 16 },
    { header: "Họ tên", key: "name", width: 24 },
    { header: "Trạng thái chốt", key: "status", width: 22 },
    { header: "Lý do", key: "reason", width: 40 },
    { header: "Cập nhật", key: "created", width: 22 },
  ];
  closureSheet.columns = closureColumns.map(({ key, width }) => ({ key, width }));
  addTitle(closureSheet, `CHỐT NGÀY CÔNG THÁNG ${monthLabel}`, "Theo dõi ngày nhân sự đã xác nhận, quản lý đã khóa hoặc đã mở lại để điều chỉnh.");
  closureSheet.addRow([]);
  closureSheet.addRow(closureColumns.map((column) => column.header));
  styleHeader(closureSheet.getRow(4));
  input.closures.forEach((row) => {
    const worker = workerDirectory.get(row.worker_id);
    closureSheet.addRow({
      date: dateText(row.work_date),
      code: safeText(worker?.employee_code ?? row.worker_id),
      name: safeText(worker?.worker_name ?? "Nhân sự không còn trong danh sách"),
      status: closureLabels[row.status],
      reason: safeText(row.reason),
      created: row.created_at ? new Date(row.created_at).toLocaleString("vi-VN") : "",
    });
  });
  if (!input.closures.length) closureSheet.addRow(["Không có dữ liệu"]);
  closureSheet.views = [{ state: "frozen", ySplit: 4 }];
  closureSheet.autoFilter = { from: "A4", to: "F4" };
  styleDataRows(closureSheet);

  return workbook;
}

export async function exportFactoryAttendanceWorkbook(input: ExportInput) {
  const { saveAs } = await import("file-saver");
  const workbook = await buildFactoryAttendanceWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `bang-cham-cong-${input.month}.xlsx`,
  );
}

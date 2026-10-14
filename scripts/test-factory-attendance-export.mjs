import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryDirectory = await mkdtemp(join(process.cwd(), ".attendance-export-test-"));
const bundlePath = join(temporaryDirectory, "factory-attendance-export.mjs");

try {
  await build({
    entryPoints: ["src/lib/factory-attendance-export.ts"],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
  });

  const { buildFactoryAttendanceWorkbook } = await import(pathToFileURL(bundlePath).href);
  const workbook = await buildFactoryAttendanceWorkbook({
    month: "2026-09",
    workers: [{ worker_id: "worker-a", employee_code: "A01", worker_name: "An", worker_type: "HELPER" }],
    rows: [{
      id: "attendance-a",
      source_type: "FACTORY",
      production_order_id: null,
      production_order_number: null,
      production_order_operation_id: null,
      operation_code: null,
      operation_name: null,
      worker_id: "worker-a",
      employee_code: "A01",
      worker_name: "An",
      worker_type: "HELPER",
      attendance_method: "DAY",
      work_date: "2026-09-01",
      day_units: 1,
      work_hours: null,
      check_in_time: null,
      check_out_time: null,
      break_minutes: 0,
      output_quantity: null,
      activity_name: "Phụ xưởng",
      rate_amount: 300000,
      calculated_amount: 300000,
      cost_classification: "DIRECT_LABOR",
      is_estimated: false,
      notes: null,
      created_at: "2026-09-01T10:00:00Z",
      cost_visible: true,
      is_reversed: false,
      reversal_reason: null,
      workflow_status: "APPROVED",
    }],
    dayStatuses: [{
      worker_id: "worker-b",
      employee_code: "B01",
      worker_name: "Bình",
      worker_type: "SEWER",
      work_date: "2026-09-01",
      status: "PAID_LEAVE",
      meal_eligible: false,
      reason: "Nghỉ phép",
      created_at: "2026-09-01T10:00:00Z",
    }],
    overtimeRows: [{
      id: "overtime-c",
      worker_id: "worker-c",
      employee_code: "C01",
      worker_name: "Chi",
      worker_type: "CUTTER",
      work_date: "2026-09-01",
      overtime_type: "NORMAL_OVERTIME",
      overtime_minutes: 90,
      reason: "Hoàn tất công việc",
      status: "APPROVED",
      created_at: "2026-09-01T10:00:00Z",
    }],
    closures: [{
      worker_id: "worker-d",
      work_date: "2026-09-01",
      status: "LEADER_CONFIRMED",
      reason: "Đã đối soát",
      created_at: "2026-09-01T10:00:00Z",
    }],
  });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "Tổng hợp",
    "Chi tiết",
    "Sản lượng",
    "Trạng thái ngày",
    "Tăng ca",
    "Chốt ngày",
  ]);

  const summary = workbook.getWorksheet("Tổng hợp");
  assert.ok(summary);
  assert.match(String(summary.getCell("A1").value), /^BẢNG TỔNG HỢP/);
  assert.equal(summary.getCell("A4").value, "Mã nhân sự");
  assert.equal(summary.autoFilter.to, "S4");
  assert.deepEqual(
    [5, 6, 7, 8].map((rowNumber) => summary.getCell(`B${rowNumber}`).value),
    ["An", "Bình", "Chi", "Nhân sự không còn trong danh sách"],
  );
  assert.equal(summary.getCell("I6").value, 1);
  assert.equal(summary.getCell("N7").value, 90);
  assert.equal(summary.getCell("S8").value, 1);

  const closure = workbook.getWorksheet("Chốt ngày");
  assert.ok(closure);
  assert.equal(closure.getCell("A4").value, "Ngày");
  assert.equal(closure.getCell("D5").value, "Quản lý đã chốt");

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 0);
  console.log("factory_attendance_export_test: PASS");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

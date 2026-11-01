import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoDir = process.cwd();

// 1. Verify files exist and contain required components
const unifiedTabsFile = fs.readFileSync(path.join(repoDir, "src/components/payroll/UnifiedAttendancePayrollTabs.tsx"), "utf8");
assert.ok(unifiedTabsFile.includes("1. Chấm công & Sản lượng"));
assert.ok(unifiedTabsFile.includes("2. Bảng lương tháng"));
assert.ok(unifiedTabsFile.includes("3. Đơn giá & Nhân sự"));

const livePayrollFile = fs.readFileSync(path.join(repoDir, "src/lib/live-monthly-payroll.ts"), "utf8");
assert.ok(livePayrollFile.includes("export function computeLiveMonthlyPayroll"));
assert.ok(livePayrollFile.includes("export async function exportLiveMonthlyPayrollExcel"));
assert.ok(livePayrollFile.includes("export async function exportBankTransferExcel"));
assert.ok(livePayrollFile.includes("export function updateWorkerMonthOverride"));
assert.ok(livePayrollFile.includes("export function bulkSetMonthPaymentStatus"));

const workbenchFile = fs.readFileSync(path.join(repoDir, "src/components/payroll/PayrollMonthWorkbench.tsx"), "utf8");
assert.ok(workbenchFile.includes("computeLiveMonthlyPayroll"));
assert.ok(workbenchFile.includes("Thưởng thêm (₫)"));
assert.ok(workbenchFile.includes("Phạt / Trừ khác (₫)"));
assert.ok(workbenchFile.includes("Tạm ứng (₫)"));
assert.ok(workbenchFile.includes("Xuất Excel Bảng lương"));
assert.ok(workbenchFile.includes("Xuất Ủy nhiệm chi NH"));

const rosterFile = fs.readFileSync(path.join(repoDir, "src/components/payroll/PayrollWorkerRoster.tsx"), "utf8");
assert.ok(rosterFile.includes("Tài khoản ngân hàng nhận lương"));
assert.ok(rosterFile.includes("Chính sách chung (BHXH, Tăng ca, Lịch công)"));

const navCatalogFile = fs.readFileSync(path.join(repoDir, "src/lib/navigation-catalog.ts"), "utf8");
assert.ok(navCatalogFile.includes("Chấm công & Tính lương"));
assert.ok(!navCatalogFile.includes("id: 'payroll-settings'"));

const myAttFile = fs.readFileSync(path.join(repoDir, "src/pages/MyAttendancePage.tsx"), "utf8");
assert.ok(myAttFile.includes("1. Công & Sản lượng"));
assert.ok(myAttFile.includes("2. Tạm tính ngày"));
assert.ok(myAttFile.includes("3. Thực lĩnh dự kiến tháng"));

console.log("ALL_PAYROLL_STREAMLINING_CHECKS_PASSED");

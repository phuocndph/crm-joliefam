import ExcelJS from "exceljs";

export type PayrollRateExportRow = {
  productCode: string;
  productName: string;
  rate: number | string;
  unit: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  status: string;
};

const statusLabels: Record<string, string> = {
  APPROVED: "Đã duyệt", DRAFT: "Nháp", RETIRED: "Đã kết thúc", SUPERSEDED: "Đã thay thế",
};

function excelDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Ngày hiệu lực ${value} không đúng định dạng.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Ngày hiệu lực ${value} không hợp lệ.`);
  }
  return date;
}

/** An informational export of the displayed rows, preserving their order. */
export function buildPayrollRatesWorkbook(rows: readonly PayrollRateExportRow[]) {
  if (!rows.length) throw new Error("Không có đơn giá để xuất. Hãy kiểm tra bộ lọc.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Joliefam";
  const sheet = workbook.addWorksheet("Bảng giá công may");
  sheet.columns = [
    { header: "STT", key: "order", width: 8 },
    { header: "Mã sản phẩm", key: "code", width: 22 },
    { header: "Tên công việc / sản phẩm", key: "name", width: 44 },
    { header: "Đơn giá (đồng)", key: "rate", width: 20 },
    { header: "Đơn vị", key: "unit", width: 16 },
    { header: "Từ ngày", key: "from", width: 16 },
    { header: "Đến ngày", key: "to", width: 20 },
    { header: "Nguồn tham chiếu", key: "source", width: 42 },
    { header: "Trạng thái", key: "status", width: 20 },
  ];
  sheet.getColumn("code").numFmt = "@";
  sheet.getColumn("rate").numFmt = "#,##0.##";
  sheet.getColumn("from").numFmt = "dd/mm/yyyy";
  sheet.getColumn("to").numFmt = "dd/mm/yyyy";
  rows.forEach((item, index) => {
    const amount = Number(item.rate);
    if (String(item.rate).trim() === "" || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`Đơn giá của mã ${item.productCode} không hợp lệ; chưa thể xuất Excel.`);
    }
    sheet.addRow({
      order: index + 1,
      code: String(item.productCode),
      name: String(item.productName),
      rate: amount,
      unit: item.unit === "SET" ? "Bộ" : "Sản phẩm",
      from: excelDate(item.effectiveFrom),
      to: item.effectiveTo ? excelDate(item.effectiveTo) : "Không giới hạn",
      source: item.source || "Chưa ghi nguồn",
      status: statusLabels[item.status] ?? "Chưa xác định",
    });
  });
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `I${sheet.rowCount}` };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.alignment = { vertical: "middle", horizontal: columnNumber === 4 ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD8E1EA" } } };
      if (rowNumber % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F6FA" } };
    });
  });
  return workbook;
}

export async function exportPayrollRatesExcel(rows: readonly PayrollRateExportRow[], exportDate = new Date().toISOString().slice(0, 10)) {
  const workbook = buildPayrollRatesWorkbook(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `bang-gia-cong-may-${exportDate}.xlsx`;
  const download = () => saveAs(blob, filename);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isMacOSWebView = /Macintosh/.test(userAgent) && /AppleWebKit/.test(userAgent) && !/Safari/.test(userAgent);
  const autoDownloadStarted = typeof HTMLAnchorElement !== "undefined"
    && "download" in HTMLAnchorElement.prototype && !isMacOSWebView;
  // FileSaver retains the object URL for 40 seconds so browsers can finish the download.
  // Its popup/navigation fallback must start from a direct user click, not after workbook preparation.
  if (autoDownloadStarted) download();
  // A later direct button click can download synchronously with fresh user activation.
  return { filename, download, autoDownloadStarted };
}

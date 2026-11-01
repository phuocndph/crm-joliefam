import ExcelJS from "exceljs";
import {parseExactProductPrice,productRateUnitLabel,isProductRateISODate,literalProductRateText} from './product-rate-display';

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

/** An informational export of the displayed rows, preserving their order. */
export function buildPayrollRatesWorkbook(rows: readonly PayrollRateExportRow[]) {
  if (!rows.length) throw new Error("Không có đơn giá để xuất. Hãy kiểm tra bộ lọc.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Joliefam";
  const sheet = workbook.addWorksheet("Bảng giá công may");
  sheet.columns = [
    { header: "STT", key: "order", width: 8 },
    { header: "Mã công Excel", key: "code", width: 22 },
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
  sheet.getColumn("from").numFmt = "@";
  sheet.getColumn("to").numFmt = "@";
  sheet.getCell('D1').note='Giá có phần lẻ hoặc vượt giới hạn Excel được lưu dạng văn bản để giữ chính xác.';
  rows.forEach((item, index) => {
    const context=`Dòng ${index+1} (${item.productCode})`;
    // Numeric legacy Supabase values retain their already available precision.
    const price=parseExactProductPrice(typeof item.rate==='number'?String(item.rate):item.rate);
    if(!price)throw new Error(`${context}: đơn giá không hợp lệ; chưa thể xuất Excel.`);
    if(!isProductRateISODate(item.effectiveFrom)||item.effectiveTo!==null&&(!isProductRateISODate(item.effectiveTo)||item.effectiveTo<item.effectiveFrom))throw new Error(`${context}: ngày hiệu lực không hợp lệ.`);
    const unit=productRateUnitLabel(item.unit);if(unit==='Đơn vị không hợp lệ')throw new Error(`${context}: đơn vị không hợp lệ.`);
    const numeric=price.fraction==='00'&&price.whole.length<=15;
    const row=sheet.addRow({
      order: index + 1,
      code: literalProductRateText(item.productCode,context+' mã công'),
      name: literalProductRateText(item.productName,context+' tên'),
      rate: numeric?Number(price.whole):price.canonical,
      unit,
      from: item.effectiveFrom,
      to: item.effectiveTo??"Không giới hạn",
      source: literalProductRateText(item.source??"Chưa ghi nguồn",context+' nguồn'),
      status: literalProductRateText(statusLabels[item.status]??item.status,context+' trạng thái'),
    });
    row.getCell('rate').numFmt=numeric?'#,##0':'@';
  });
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `I${sheet.rowCount}` };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF202020" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.alignment = { vertical: "middle", horizontal: columnNumber === 4 ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD8E1EA" } } };
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

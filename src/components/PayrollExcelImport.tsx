import { useRef, useState } from "react";
import ExcelJS from "exceljs";
import { Download, FileSpreadsheet, HelpCircle, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { localApi, type AttendanceDaySummary } from "@/lib/local-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PayrollDialogContent as DialogContent } from "@/components/payroll/PayrollDialogContent";
import {rateCellValue} from "../../server/product-rate-inputs.mjs";

type ImportRow = { sheet: string; row: number; values: Record<string, unknown> };
type ClosureReview = {row:number;employee_code:string;target_status:string;reason:string;summary:AttendanceDaySummary};
type ImportPreview = { preview_token?: string | null; closure_reviews?: ClosureReview[]; fingerprint?: string; rows?: ImportRow[]; valid_rows?: number; invalid_rows?: number; errors?: Array<Record<string, unknown>>; warnings?: Array<Record<string, unknown>> };

const TEMPLATE_URL = "/templates/Mau_nhap_lieu_cham_cong_tien_luong_v2.xlsx";

function cellValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object" && "result" in value) return (value as { result: unknown }).result ?? "";
  return value ?? "";
}

const headerAliases: Record<string, string> = {
  "loai dong": "__example",
  "ma nhan su": "ma_nv",
  "ho ten": "ho_ten",
  "loai nhan su": "loai_to",
  "chuc danh": "chuc_danh",
  "ma dia diem": "ma_dia_diem",
  "loai hop dong": "loai_hop_dong",
  "ngay vao lam": "ngay_vao",
  "ngay nghi": "ngay_nghi",
  "trang thai luong": "trang_thai_luong",
  "dang lam viec": "dang_lam_viec",
  "dang lam viec co/khong": "dang_lam_viec",
  "dang ap dung co/khong": "dang_ap_dung",
  "tai khoan chinh co/khong": "tk_chinh",
  "la uoc tinh co/khong": "la_uoc_tinh",
  "huong tien an co/khong": "huong_tien_an",
  "ly do ghi chu": "ly_do",
  "ly do/ghi chu": "ly_do",
  "ma nhom": "ma_nhom",
  "ten nhom": "ten_nhom",
  "mo ta": "mo_ta",
  "dang ap dung": "dang_ap_dung",
  "hinh thuc luong": "hinh_thuc_luong",
  "ma nhom chinh sach": "ma_nhom",
  "tu ngay": "tu_ngay",
  "den ngay": "den_ngay",
  "co san luong": "co_san_luong",
  "co tang ca": "co_tang_ca",
  "co tien an": "co_tien_an",
  "co phu cap": "co_phu_cap",
  "co khau tru": "co_khau_tru",
  "co bhxh": "co_bhxh",
  "phu cap co dinh": "phu_cap_co_dinh",
  "khau tru co dinh": "khau_tru_co_dinh",
  "nguon tham chieu": "nguon",
  "ma to truong": "ma_to_truong",
  "muc tien": "so_tien",
  "phut chuan thang": "phut_chuan_thang",
  "la uoc tinh": "la_uoc_tinh",
  "ma san pham excel": "ma_sp",
  "ten san pham": "ten_sp",
  "don vi": "don_vi",
  "don gia": "don_gia",
  "sku crm doi chieu": "crm_product_sku",
  "sku crm doi chieu tuy chon": "crm_product_sku",
  "muc nguoi lao dong": "so_tien_nv",
  "so tai khoan": "so_tk",
  "chu tai khoan": "chu_tk",
  "ma ngan hang": "ma_nh",
  "ten ngan hang": "ngan_hang",
  "tai khoan chinh": "tk_chinh",
  "tu ky": "tu_ky",
  "den ky": "den_ky",
  "loai khoan": "loai_khoan",
  "huong": "cong_tru",
  "so cong": "so_cong",
  "ngay": "ngay",
  "cong viec": "cong_viec",
  "ghi chu": "ghi_chu",
  "khoa chong nhap trung": "idempotency_key",
  "khoa chong nhap trung tuy chon": "idempotency_key",
  "gio vao": "gio_vao",
  "gio ra": "gio_ra",
  "phut nghi": "phut_nghi",
  "so luong": "so_luong",
  "loai tang ca": "loai_tang_ca",
  "so phut": "so_phut",
  "trang thai": "trang_thai",
  "huong tien an": "huong_tien_an",
  "trang thai de nghi": "trang_thai_de_nghi",
  "so ngay chuan": "so_ngay_chuan",
};

function canonicalHeader(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("__") || /^[a-z0-9_]+$/.test(raw)) return raw;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[()*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return headerAliases[normalized] ?? raw;
}


const sheetLabels: Record<string, string> = {
  NHAN_SU: "Thông tin nhân sự", NHOM_CHINH_SACH: "Nhóm chính sách", PHAN_LOAI_LUONG: "Phân loại lương",
  HO_SO_LUONG: "Hồ sơ lương", PHAN_CONG_TO: "Phân công tổ", MUC_LUONG: "Mức lương", BANG_GIA_CONG_MAY: "Bảng giá công may",
  BHXH: "Bảo hiểm xã hội", TAI_KHOAN_NGAN_HANG: "Tài khoản ngân hàng", PHU_CAP_KHAU_TRU: "Phụ cấp và khấu trừ",
  CHAM_CONG_NGAY: "Chấm công ngày", CHAM_CONG_GIO: "Chấm công giờ", CHAM_SAN_LUONG: "Chấm sản lượng", TANG_CA: "Tăng ca",
  TRANG_THAI_NGAY_CONG: "Trạng thái ngày công", CHOT_NGAY: "Chốt ngày", KY_LUONG: "Kỳ lương",
};
const fieldLabels: Record<string, string> = {
  __example: "Loại dòng", ma_nv: "Mã nhân sự", ho_ten: "Họ tên", loai_to: "Loại nhân sự", chuc_danh: "Chức danh",
  ma_dia_diem: "Mã địa điểm", loai_hop_dong: "Loại hợp đồng", ngay_vao: "Ngày vào làm", ngay_nghi: "Ngày nghỉ",
  trang_thai_luong: "Trạng thái lương", dang_lam_viec: "Đang làm việc", dang_ap_dung: "Đang áp dụng",
  ly_do: "Lý do / ghi chú", ma_nhom: "Mã nhóm chính sách", ten_nhom: "Tên nhóm", mo_ta: "Mô tả",
  hinh_thuc_luong: "Hình thức lương", tu_ngay: "Từ ngày", den_ngay: "Đến ngày", co_san_luong: "Có sản lượng",
  co_tang_ca: "Có tăng ca", co_tien_an: "Có tiền ăn", co_phu_cap: "Có phụ cấp", co_khau_tru: "Có khấu trừ", co_bhxh: "Có BHXH",
  phu_cap_co_dinh: "Phụ cấp cố định (đồng)", khau_tru_co_dinh: "Khấu trừ cố định (đồng)", nguon: "Nguồn tham chiếu",
  ma_to_truong: "Mã tổ trưởng", so_tien: "Số tiền (đồng)", phut_chuan_thang: "Phút chuẩn tháng", la_uoc_tinh: "Là ước tính",
  ma_sp: "Mã sản phẩm Excel", ten_sp: "Tên sản phẩm", don_vi: "Đơn vị", don_gia: "Đơn giá (đồng)",
  crm_product_sku: "Mã kho để đối chiếu", so_tien_nv: "Mức người lao động đóng (đồng)", so_tk: "Số tài khoản",
  chu_tk: "Chủ tài khoản", ma_nh: "Mã ngân hàng", ngan_hang: "Tên ngân hàng", tk_chinh: "Tài khoản chính",
  tu_ky: "Từ kỳ", den_ky: "Đến kỳ", loai_khoan: "Loại khoản", cong_tru: "Khoản cộng / trừ", so_cong: "Số công",
  ngay: "Ngày", cong_viec: "Công việc", ghi_chu: "Ghi chú", idempotency_key: "Khóa chống nhập trùng",
  gio_vao: "Giờ vào", gio_ra: "Giờ ra", phut_nghi: "Phút nghỉ", so_luong: "Số lượng", loai_tang_ca: "Loại tăng ca",
  so_phut: "Số phút", trang_thai: "Trạng thái", huong_tien_an: "Hưởng tiền ăn", trang_thai_de_nghi: "Trạng thái đề nghị",
  so_ngay_chuan: "Số ngày chuẩn",
};
const valueLabels: Record<string, string> = {
  MONTHLY_MANAGER: "Lương tháng quản lý", MONTHLY_HELPER: "Lương tháng phụ trợ", PIECE_RATE: "Lương sản phẩm", HOURLY: "Theo giờ",
  TRUE: "Có", FALSE: "Không", YES: "Có", NO: "Không",
  CUTTER: "Thợ cắt", SEWER: "Thợ may", IRONING: "Thợ ủi", QC: "Kiểm tra chất lượng", PACKER: "Đóng gói", HELPER: "Phụ trợ", SUPERVISOR: "Tổ trưởng", GENERIC: "Khác",
  PRESENT: "Có mặt", ABSENT: "Vắng", PAID_LEAVE: "Nghỉ phép có lương", UNPAID_LEAVE: "Nghỉ không lương", OFF: "Nghỉ định kỳ",
  OPEN: "Mở", EMPLOYEE_CONFIRMED: "Quản lý xác nhận hộ", LEADER_CONFIRMED: "Chốt ngày", REOPENED: "Mở lại",
  MEAL: "Tiền ăn", SALARY_ADVANCE: "Tạm ứng", ALLOWANCE: "Phụ cấp", PENALTY: "Phạt",
  ACTIVE: "Đang làm", SUSPENDED: "Tạm ngưng", TERMINATED: "Đã nghỉ", EARNING: "Khoản cộng", DEDUCTION: "Khấu trừ",
  PIECE: "Sản phẩm", SET: "Bộ", PRODUCT: "Sản phẩm", NORMAL: "Ngày thường", SUNDAY: "Chủ nhật", HOLIDAY: "Ngày lễ",
};
const sheetLabel = (value: unknown) => sheetLabels[String(value)] ?? String(value ?? "Trang dữ liệu");
const fieldLabel = (value: unknown) => fieldLabels[String(value)] ?? String(value ?? "Nội dung");
const readableMessage = (value: unknown) => String(value ?? "Cần kiểm tra lại dữ liệu").replace(/\b[a-z][a-z_]+\b/g, (key) => fieldLabels[key] ?? key);
const previewCell = (key: string, value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (["so_tk", "account_number", "bank_account_number"].includes(key)) return `•••• ${text.slice(-4)}`;
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return valueLabels[text] ?? text;
};

async function readWorkbook(file: File): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: ImportRow[] = [];
  workbook.worksheets.forEach((sheet) => {
    let headerRow = 0;
    sheet.eachRow((row, rowNumber) => {
      if (!headerRow && (row.values as unknown[]).some((value) => canonicalHeader(value) === "__example")) headerRow = rowNumber;
    });
    if (!headerRow) return;
    const headers = (sheet.getRow(headerRow).values as unknown[]).slice(1).map(canonicalHeader);
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const valuesArray = (sheet.getRow(rowNumber).values as unknown[]).slice(1);
      const values: Record<string, unknown> = {};
      const priceSheet = sheet.name === "BANG_GIA_CONG_MAY";
      if (priceSheet && ["VI_DU", "MẪU", "MAU", "DEMO"].includes(String(cellValue(valuesArray[headers.indexOf("__example")]) ?? "").trim().toUpperCase())) continue;
      headers.forEach((header, index) => { if (header) values[header] = priceSheet && ["ma_sp","ten_sp","don_gia","don_vi","tu_ngay","den_ngay"].includes(header) ? rateCellValue(valuesArray[index],header,`Bảng giá công may · dòng ${rowNumber}`) : cellValue(valuesArray[index]); });
      const meaningful = Object.entries(values).some(([key, value]) => key !== "__example" && String(value ?? "").trim() !== "");
      const marker = String(values.__example ?? "").trim().toUpperCase();
      if (meaningful && !["VI_DU", "MẪU", "MAU", "DEMO"].includes(marker)) {
        rows.push({ sheet: sheet.name, row: rowNumber, values });
      }
    }
  });
  return rows;
}

export function PayrollExcelImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setPreview(null);
    setSource(null);
    try {
      const rows = await readWorkbook(file);
      if (!rows.length) throw new Error("File chỉ còn dòng MẪU/DEMO hoặc chưa có dữ liệu. Hãy điền dữ liệu mới, hoặc đổi loại dòng DEMO thành NHẬP để kiểm thử.");
      const result = await localApi.previewPayrollImport({ template_key: "payroll-v1", source_name: file.name, rows });
      setSource(file);
      setPreview(result as ImportPreview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể đọc file Excel.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const apply = async () => {
    if (!preview?.fingerprint || !preview.rows || (preview.invalid_rows ?? 0) > 0 || !source) return;
    setApplyBusy(true);
    try {
      const result = await localApi.applyPayrollImport({ template_key: "payroll-v1", source_name: source.name, fingerprint: preview.fingerprint, preview_token: preview.preview_token, rows: preview.rows });
      toast.success(`Đã nhập ${Number(result.imported || 0).toLocaleString("vi-VN")} dòng dữ liệu.`);
      setPreview(null); setSource(null); onImported?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể nhập dữ liệu."); }
    finally { setApplyBusy(false); }
  };

  const closureReviews = preview?.closure_reviews ?? [];
  const hasClosureRows = (preview?.rows ?? []).some(row=>row.sheet==='CHOT_NGAY');
  const errors = preview?.errors ?? [];
  const sheets = [...new Set((preview?.rows ?? []).map((row) => row.sheet))].map((sheet) => {
    const rows = (preview?.rows ?? []).filter((row) => row.sheet === sheet);
    const invalidCount = new Set(errors.filter((error) => error.sheet === sheet).map((error) => error.row)).size;
    return { sheet, rows, invalidCount };
  });
  return <>
    <div className="flex flex-wrap items-start gap-2">
      <Button variant="outline" size="sm" className="h-11 gap-1.5 px-2.5 lg:h-9" asChild><a href={TEMPLATE_URL} download><Download className="h-4 w-4" />Tải mẫu Excel</a></Button>
      <input ref={inputRef} className="hidden" type="file" accept=".xlsx" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <Button size="sm" className="h-11 gap-1.5 px-2.5 lg:h-9" onClick={() => inputRef.current?.click()} disabled={busy}><Upload className="h-4 w-4" />{busy ? "Đang kiểm tra…" : "Nhập Excel"}</Button>
      <details className="min-w-0 text-xs text-muted-foreground open:w-full"><summary aria-label="Hướng dẫn nhập Excel" title="Hướng dẫn nhập Excel" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md px-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 [&::-webkit-details-marker]:hidden"><HelpCircle className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Hướng dẫn nhập</span></summary><ol className="list-decimal space-y-1.5 rounded-md bg-muted/40 py-2 pl-7 pr-3"><li>Tải mẫu Excel và đọc hướng dẫn trên từng trang.</li><li>Điền dữ liệu thật; các dòng MẪU hoặc DEMO được bỏ qua. Đổi loại dòng thành NHẬP nếu muốn nhập dòng đã điền.</li><li>Chọn Nhập Excel, kiểm tra các trang, lỗi và cảnh báo.</li><li>Sửa hết lỗi trong tệp, chọn lại rồi xác nhận nhập. Dữ liệu mới cần duyệt trên màn hình nghiệp vụ.</li></ol></details>
    </div>
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open && !applyBusy) { setPreview(null); setSource(null); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Kiểm tra file nhập hàng loạt</DialogTitle><DialogDescription className="break-words">Tệp: {source?.name}<span className="mt-1 block">{hasClosureRows?'File này thay đổi xác nhận hoặc trạng thái chốt ngày. Xem toàn bộ nguồn và lý do của từng ngày trước khi nhập.':'Dữ liệu nhập được tạo dưới dạng nháp hoặc chờ duyệt; hãy kiểm tra trước khi xác nhận.'}</span></DialogDescription></DialogHeader>
        {preview && <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2"><div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Dòng hợp lệ</div><div className="text-xl font-semibold text-emerald-700">{preview.valid_rows ?? 0}</div></div><div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Dòng lỗi</div><div className="text-xl font-semibold text-red-700">{preview.invalid_rows ?? 0}</div></div><div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Cảnh báo</div><div className="text-xl font-semibold">{preview.warnings?.length ?? 0}</div></div></div>
          {(preview.invalid_rows ?? 0) > 0 && <Alert variant="destructive"><AlertTitle>Chưa thể nhập: hãy sửa các dòng lỗi trong Excel</AlertTitle><AlertDescription><div className="max-h-56 space-y-2 overflow-y-auto text-sm">{errors.slice(0, 100).map((error, index) => <div key={index}><b>{sheetLabel(error.sheet)} · dòng {String(error.row)}</b><div>{fieldLabel(error.field)}: {readableMessage(error.message)}</div></div>)}{errors.length > 100 && <details><summary className="min-h-11 cursor-pointer py-3">Xem {errors.length - 100} lỗi còn lại</summary>{errors.slice(100).map((error, index) => <p key={index}>{sheetLabel(error.sheet)} · dòng {String(error.row)} · {fieldLabel(error.field)}: {readableMessage(error.message)}</p>)}</details>}</div></AlertDescription></Alert>}
          {(preview.invalid_rows ?? 0) === 0 && <Alert><FileSpreadsheet className="h-4 w-4" /><AlertTitle>Đã kiểm tra xong</AlertTitle><AlertDescription>{hasClosureRows?'Bản xem trước có hiệu lực 15 phút. Nguồn hoặc trạng thái thay đổi sẽ yêu cầu xem trước lại. Không tự động duyệt nguồn chờ.':'Toàn bộ dòng trong tệp đã vượt qua bước kiểm tra. Các bản ghi cần được duyệt tiếp trên màn hình nghiệp vụ.'}</AlertDescription></Alert>}
          {(preview.warnings?.length ?? 0) > 0 && <Alert className="border-amber-200 bg-amber-50"><AlertTitle>Có cảnh báo cần xem lại</AlertTitle><AlertDescription className="space-y-2 text-sm">{preview.warnings?.slice(0, 5).map((warning, index) => <div key={index}><b>{sheetLabel(warning.sheet)} · dòng {String(warning.row ?? "—")}</b>: {readableMessage(warning.message ?? fieldLabel(warning.field))}</div>)}{(preview.warnings?.length ?? 0) > 5 && <details><summary className="min-h-11 cursor-pointer py-3">Xem tất cả {preview.warnings?.length} cảnh báo</summary><div className="max-h-56 space-y-2 overflow-y-auto">{preview.warnings?.slice(5).map((warning, index) => <p key={index}>{sheetLabel(warning.sheet)} · dòng {String(warning.row ?? "—")}: {readableMessage(warning.message ?? fieldLabel(warning.field))}</p>)}</div></details>}</AlertDescription></Alert>}
          {hasClosureRows && <Alert className="border-amber-200 bg-amber-50"><AlertTitle>Xác nhận / chốt / mở lại ngày công</AlertTitle><AlertDescription>Xác nhận hộ cần quản lý và lý do thật. Chốt ngày cần xác nhận còn hiệu lực và đã duyệt hết công, sản lượng, tăng ca. Mở lại cần lý do; kỳ lương khóa vẫn phải dùng quy trình điều chỉnh. Mọi file xác nhận/chốt/mở lại chỉ gồm dòng chốt ngày; nhập nguồn và thiết lập trong file riêng trước.</AlertDescription></Alert>}
          {closureReviews.length>0 && <section className="space-y-3" aria-label="Toàn bộ ngày công cần xem lại"><h3 className="font-semibold">Xem lại từng ngày ({closureReviews.length})</h3>{closureReviews.map(review=><div key={review.row} className="space-y-2 rounded border p-3 text-sm">
            <h4 className="font-semibold">Dòng {review.row} · {review.employee_code} · {review.summary.work_date}</h4>
            <p>Thao tác: {previewCell('trang_thai_de_nghi',review.target_status)} · Lý do: {review.reason || 'Chưa nhập'}</p>
            <p>Trạng thái ngày: {review.summary.day_status ? previewCell('trang_thai',review.summary.day_status) : 'Chưa ghi nhận trạng thái'} · {review.summary.classified?'Có nguồn / trạng thái để xác nhận':'Chưa có nguồn hợp lệ'}</p>
            {review.summary.day_status_reason && <p>Ghi chú trạng thái: {review.summary.day_status_reason}</p>}
            <p>{review.summary.payroll_locked?'Kỳ lương đã khóa':review.summary.closure?.status==='LEADER_CONFIRMED'?'Ngày đã chốt':review.summary.confirmation_current?'Xác nhận còn hiệu lực':'Chưa có xác nhận hiện hành'}</p>
            {review.summary.closure?.confirmation_actor_id && <p>Người xác nhận: {review.summary.closure.confirmation_actor_name || review.summary.closure.confirmation_actor_id} · {review.summary.closure.confirmation_kind==='PROXY'?'Xác nhận hộ':'Nhân viên xác nhận'} · {review.summary.closure.confirmed_at} · {review.summary.closure.confirmation_reason}</p>}
            {!review.summary.sources.length && <p>Chưa có phiếu công, sản lượng hoặc tăng ca.</p>}
            {review.summary.sources.map(source=><div key={source.source_type+source.id} className="space-y-1 rounded border bg-background p-2">
              <p className="font-medium">{source.source_type==='ATTENDANCE'?'Công':source.source_type==='PRODUCTION_ENTRY'?'Sản lượng':'Tăng ca'} · {({SUBMITTED:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Bị từ chối',REVERSED:'Đã đảo',LOCKED:'Đã khóa'} as Record<string,string>)[source.status] || source.status}</p>
              <p>{source.source_type==='ATTENDANCE'?(source.facts.method==='DAY'?`${source.facts.day_units} ngày công`:source.facts.method==='HOUR'?`${source.facts.check_in}–${source.facts.check_out} · nghỉ ${source.facts.break_minutes} phút · thực làm ${source.facts.worked_minutes} phút`:'Công sản lượng cũ cần đối soát'):source.source_type==='PRODUCTION_ENTRY'?`${source.facts.product_name || source.facts.piece_rate_code || 'Sản lượng'} · ${source.facts.quantity} sản phẩm`:`${source.facts.overtime_minutes} phút · ${source.facts.overtime_type==='SUNDAY_OVERTIME'?'Chủ nhật':source.facts.overtime_type==='HOLIDAY_OVERTIME'?'Ngày lễ':'Ngày thường'}`}</p>
              {!!source.facts.notes && <p>Ghi chú: {String(source.facts.notes)}</p>}{!!source.facts.review_reason && <p>Lý do xử lý: {String(source.facts.review_reason)}</p>}
              <p className="text-xs text-muted-foreground">Ghi bởi {source.recorded_by || 'Chưa có thông tin người ghi'} · {source.recorded_at || 'Chưa có thời gian ghi'}</p>
            </div>)}
          </div>)}</section>}
          <div className="space-y-2"><h3 className="text-sm font-semibold">Nội dung theo từng trang Excel</h3><p className="text-xs text-muted-foreground">Mở từng trang để đọc trước vài dòng. Số tài khoản được che; xác nhận nhập sẽ xử lý toàn bộ tệp.</p>
            {sheets.map(({ sheet, rows, invalidCount }) => <details key={sheet} className="rounded-lg border bg-muted/10"><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span className="font-medium">{sheetLabel(sheet)}</span><span className="text-xs text-muted-foreground">{rows.length} dòng · {invalidCount} dòng lỗi</span></summary><div className="space-y-3 border-t p-3">{(sheet==='CHOT_NGAY'?rows:rows.slice(0, 3)).map((row) => <div key={row.row} className="rounded border bg-background p-3"><p className="mb-2 text-xs font-semibold">Dòng {row.row}</p><dl className="grid grid-cols-[minmax(90px,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1 text-xs">{Object.entries(row.values).filter(([key]) => !["__example", "idempotency_key"].includes(key)).map(([key, value]) => <div key={key} className="contents"><dt className="text-muted-foreground">{fieldLabel(key)}</dt><dd className="break-words">{previewCell(key, value)}</dd></div>)}</dl></div>)}{sheet!=='CHOT_NGAY' && rows.length > 3 && <p className="text-xs text-muted-foreground">Đang hiển thị 3/{rows.length} dòng.</p>}</div></details>)}
          </div>
        </div>}
        <DialogFooter><Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={applyBusy || busy}>Chọn tệp khác</Button><Button variant="outline" onClick={() => { setPreview(null); setSource(null); }} disabled={applyBusy}><X className="mr-2 h-4 w-4" />Đóng</Button><Button onClick={() => void apply()} disabled={applyBusy || busy || !preview?.fingerprint || !preview.rows?.length || (preview.invalid_rows ?? 0) > 0 || (hasClosureRows && (!preview.preview_token || closureReviews.length!==preview.rows.filter(row=>row.sheet==='CHOT_NGAY').length))}>{applyBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Xác nhận nhập toàn bộ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

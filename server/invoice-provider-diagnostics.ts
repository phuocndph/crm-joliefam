/** Closed diagnostics: provider text, URLs and arbitrary exception fields never cross this boundary. */
const descriptions = {
  AUTH_OR_API_PERMISSION_REQUIRED: ["Viettel chưa chấp nhận xác thực hoặc quyền API.", "Kiểm tra tài khoản, mật khẩu và quyền API trên Viettel."],
  HTTP_ERROR: ["Viettel trả trạng thái HTTP không thành công.", "Thử lại sau; nếu tiếp diễn, kiểm tra dịch vụ Viettel."],
  NETWORK_ERROR: ["Không nhận được phản hồi đầy đủ từ Viettel.", "Kiểm tra kết nối mạng máy chủ rồi thử lại."],
  TIMEOUT: ["Hết thời gian đọc Viettel; checkpoint được giữ.", "Thử lại với khoảng ngày nhỏ hơn."],
  INVALID_RESPONSE: ["Phản hồi Viettel không phải nội dung JSON hợp lệ trong giới hạn.", "Thử lại; nếu tiếp diễn, đối chiếu đặc tả phản hồi Viettel."],
  SOURCE_SCHEMA_UNSUPPORTED: ["Dữ liệu Viettel chưa đúng cấu trúc đọc được hỗ trợ.", "Đối chiếu cấu trúc danh sách, định danh và dòng hàng theo đặc tả."],
  PAGINATION_UNVERIFIED: ["Chưa xác minh được tiến độ hoặc độ đầy đủ của trang nguồn.", "Kiểm tra chỉ số trang; bắt đầu lượt mới để đối chiếu khi nguồn thay đổi."],
  PROVIDER_REJECTED: ["Viettel từ chối yêu cầu đọc.", "Kiểm tra quyền API và phạm vi dữ liệu trên Viettel rồi thử lại."],
  SOURCE_FILE_INVALID: ["Chưa nhận hoặc xác minh được tệp gốc hợp lệ.", "Thử lại tải tệp hoặc nhập XML gốc để đối chiếu."],
  READ_FAILED: ["Không đọc được Viettel.", "Kiểm tra quyền API, thông tin đăng nhập và kết nối rồi thử lại."],
} as const;
export type ProviderDiagnosticCode = keyof typeof descriptions;
export type ProviderDiagnostic = {
  code: ProviderDiagnosticCode | "READ_OK" | "CONFIG_CHANGED";
  message: string;
  next_action: string;
  http_status?: number;
};
type FailureDiagnostic = ProviderDiagnostic & { code: ProviderDiagnosticCode };
const trusted = new WeakMap<Error, FailureDiagnostic>();
class ProviderReadError extends Error {
  readonly diagnostic: FailureDiagnostic;
  readonly code: ProviderDiagnosticCode;
  readonly status: number;
  constructor(code: ProviderDiagnosticCode, httpStatus?: number) {
    const [message, next_action] = descriptions[code];
    const http_status = code === "HTTP_ERROR" && Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? httpStatus : undefined;
    const safeMessage = http_status === undefined ? message : `${message} HTTP ${http_status}.`;
    super(`${code}: ${safeMessage} ${next_action}`);
    this.code = code;
    this.diagnostic = { code, message: safeMessage, next_action };
    if (http_status !== undefined) this.diagnostic.http_status = http_status;
    this.status = code === "TIMEOUT" ? 504 : ["AUTH_OR_API_PERMISSION_REQUIRED", "PAGINATION_UNVERIFIED", "PROVIDER_REJECTED"].includes(code) ? 409 : 502;
    trusted.set(this, { ...this.diagnostic });
  }
}
export function providerFailure(code: ProviderDiagnosticCode, httpStatus?: number): Error & { code: ProviderDiagnosticCode; diagnostic: FailureDiagnostic; status: number } {
  return new ProviderReadError(code, httpStatus);
}
export function providerDiagnostic(error: unknown): FailureDiagnostic {
  const diagnostic = error != null && (typeof error === "object" || typeof error === "function") ? trusted.get(error as Error) : undefined;
  return diagnostic
    ? { ...diagnostic }
    : { ...providerFailure("READ_FAILED").diagnostic };
}
export function providerAbortFailure(signal: AbortSignal) {
  return providerFailure(signal.aborted && providerDiagnostic(signal.reason).code === "TIMEOUT" ? "TIMEOUT" : "NETWORK_ERROR");
}
export function storedProviderDiagnostic(value: unknown): ProviderDiagnostic {
  if (value === "READ_OK") return { code: "READ_OK", message: "Đã kiểm tra đọc được một trang Viettel.", next_action: "Đồng bộ để đối chiếu dữ liệu và tệp gốc." };
  if (value === "CONFIG_CHANGED") return { code: "CONFIG_CHANGED", message: "Cấu hình đã đổi trong khi kiểm tra.", next_action: "Tải lại cấu hình và kiểm tra đọc lại." };
  const code = typeof value === "string" && Object.hasOwn(descriptions, value) ? value as ProviderDiagnosticCode : "READ_FAILED";
  return { ...providerFailure(code).diagnostic };
}
/** Response-only projection; immutable observation bytes and hashes retain their original meaning. */
export function safeProviderObservationPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>, raw = payload.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "file_error")) return value;
  const original = raw as Record<string, unknown>, code = original.file_error;
  const file_error = code == null ? code : typeof code === "string" && Object.hasOwn(descriptions, code) ? code : "SOURCE_FILE_INVALID";
  return { ...payload, raw: { ...original, file_error } };
}
export function providerCheckState(status: unknown, code: unknown) {
  if (status == null && code == null) return { last_check_status: null, last_check_code: null, last_check_diagnostic: null };
  const diagnostic = storedProviderDiagnostic(code === "READ_OK" && status !== "READ_OK" ? null : code);
  return { last_check_status: diagnostic.code === "READ_OK" ? "READ_OK" : "FAILED", last_check_code: diagnostic.code, last_check_diagnostic: diagnostic };
}

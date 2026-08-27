// Sync any stale contract-number tokens (HD-xxxxxxxx-xxx / HDNT-xxxxxxxx-xxx)
// inside saved document overrides to the current contract number.
// This guarantees biểu mẫu (đề nghị TT, tạm ứng, bàn giao...) luôn hiển thị
// đúng số HĐ gốc dù người dùng đã lưu override từ trước.
const CONTRACT_NUMBER_RE = /\b(HDNT|HD)-\d{6,8}-\d{2,}\b/g;

export const syncContractNumberInOverrides = <T extends Record<string, any>>(
  saved: T | null | undefined,
  currentNumber: string | null | undefined,
): T | undefined => {
  if (!saved) return undefined;
  if (!currentNumber) return saved;
  const out: any = Array.isArray(saved) ? [...saved] : { ...saved };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "string") {
      if (CONTRACT_NUMBER_RE.test(v)) {
        out[key] = v.replace(CONTRACT_NUMBER_RE, currentNumber);
      }
      CONTRACT_NUMBER_RE.lastIndex = 0;
    } else if (v && typeof v === "object") {
      out[key] = syncContractNumberInOverrides(v, currentNumber);
    }
  }
  return out;
};
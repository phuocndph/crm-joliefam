export const invoiceFail = (message: string, status = 422): never => {
  throw Object.assign(new Error(message), { status });
};
export function invoiceDecimal(value: unknown, places = 6, signed = false) {
  const s = String(value ?? "").trim();
  if (
    !(signed ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(s) ||
    s.length > 26
  )
    invoiceFail("Số tiền/số lượng không hợp lệ.");
  const [w, f = ""] = s.split(".");
  if (f.length > places) invoiceFail("Quá nhiều chữ số thập phân.");
  return { n: BigInt(w + f), d: 10n ** BigInt(f.length) };
}
export const invoiceRound = (n: bigint, d: bigint): bigint =>
  n < 0n ? -invoiceRound(-n, d) : (n * 2n + d) / (2n * d);
// ISO minor unit exceptions; invoice source values are retained separately at six decimals.
export const invoiceCurrencyPlaces = (currency: string) =>
  [
    "VND",
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "ISK",
    "JPY",
    "KMF",
    "KRW",
    "PYG",
    "RWF",
    "UGX",
    "UYI",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ].includes(currency)
    ? 0
    : ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"].includes(currency)
      ? 3
      : ["CLF", "UYW"].includes(currency)
        ? 4
        : 2;
const currencyScale = (currency: string) =>
  10n ** BigInt(invoiceCurrencyPlaces(currency));
export function invoiceMinor(value: unknown, currency: string) {
  const x = invoiceDecimal(value, 6, true);
  return invoiceRound(x.n * currencyScale(currency), x.d);
}
export const invoiceAmount = (minor: bigint, currency: string) => {
  const places = invoiceCurrencyPlaces(currency),
    scale = currencyScale(currency),
    absolute = minor < 0n ? -minor : minor;
  return places === 0
    ? String(minor)
    : `${minor < 0n ? "-" : ""}${absolute / scale}.${String(absolute % scale).padStart(places, "0")}`;
};
export const invoiceTax = (value: unknown) =>
  String(value ?? "").replace(/[-\s]/g, "");
export function calculateInvoiceLines(
  raw: unknown,
  currency: string,
  signed = false,
) {
  if (!/^[A-Z]{3}$/.test(currency))
    invoiceFail("Loại tiền phải là mã ISO gồm 3 chữ cái.");
  if (!Array.isArray(raw) || !raw.length || raw.length > 1000)
    invoiceFail("Cần từ 1 đến 1.000 dòng hóa đơn.");
  let subtotal = 0n,
    vat = 0n;
  const lines = (raw as Record<string, unknown>[]).map(
    (item, index: number) => {
      if (!item || typeof item.name !== "string" || !item.name.trim())
        invoiceFail(`Dòng ${index + 1} thiếu tên.`);
      const q = invoiceDecimal(item.quantity, 6, signed),
        p = invoiceDecimal(item.unit_price ?? item.price, 6);
      if (!q.n) invoiceFail("Số lượng phải khác 0.");
      const line = invoiceRound(q.n * p.n * currencyScale(currency), q.d * p.d);
      const rate = String(item.vat_rate ?? "0").replace("%", "");
      let tax = 0n;
      if (!["KCT", "KKKNT", "KTGTT", "KTPVDC", "KHAC"].includes(rate)) {
        const r = invoiceDecimal(rate, 4);
        if (r.n > 100n * r.d) invoiceFail("Thuế suất từ 0 đến 100%.");
        tax = invoiceRound(line * r.n, r.d * 100n);
      }
      subtotal += line;
      vat += tax;
      return {
        line_no: index + 1,
        name: String(item.name).trim(),
        quantity: String(item.quantity),
        unit: String(item.unit ?? ""),
        unit_price: String(item.unit_price ?? item.price),
        vat_rate: rate,
        subtotal: invoiceAmount(line, currency),
        vat_amount: invoiceAmount(tax, currency),
        total: invoiceAmount(line + tax, currency),
        source_line: item.source_line == null ? null : String(item.source_line),
      };
    },
  );
  const total = subtotal + vat;
  if (total > 9999999999999999n || total < -9999999999999999n)
    invoiceFail("Tổng hóa đơn vượt giới hạn.");
  return {
    lines,
    subtotal: invoiceAmount(subtotal, currency),
    vat_amount: invoiceAmount(vat, currency),
    total: invoiceAmount(total, currency),
  };
}

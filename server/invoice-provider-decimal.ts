import { invoiceDecimal, invoiceFail } from "./invoice-money.js";

/** Viettel-only projection: remove redundant fractional zeros, never round or coerce a number. */
export function providerDecimalText(value: unknown, places = 6, signed = false): string {
  if (typeof value !== "string") invoiceFail("Số nguồn Viettel không đúng định dạng thập phân.");
  const text = (value as string).trim();
  if (text.length > 128 || !(signed ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(text))
    invoiceFail("Số nguồn Viettel không đúng định dạng thập phân.");
  const projected = text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  const exact = invoiceDecimal(projected, places, signed);
  if ((exact.n < 0n ? -exact.n : exact.n) >= 1000000000000000000n * exact.d)
    invoiceFail("Số nguồn Viettel vượt giới hạn lưu trữ.");
  return projected;
}
export function providerDecimal(value: unknown, places = 6, signed = false) {
  return invoiceDecimal(providerDecimalText(value, places, signed), places, signed);
}
/** Keep unsupported line values visible to the existing soft review path. */
export function providerMappedDecimal(value: unknown, places = 6, signed = false): unknown {
  try { return providerDecimalText(value, places, signed); }
  catch { return value; }
}
const numericRate = (value: string) => /^\d+(?:\.\d+)?$/.test(value);
export function providerRateText(value: unknown): string {
  if (typeof value !== "string") invoiceFail("Thuế suất nguồn Viettel chưa diễn giải được.");
  const text = (value as string).trim().replace(/%$/, "");
  if (!numericRate(text)) return value as string;
  const projected = providerDecimalText(text, 4);
  const exact = invoiceDecimal(projected, 4);
  if (exact.n > 100n * exact.d) invoiceFail("Thuế suất nguồn Viettel vượt giới hạn.");
  return projected;
}
export function providerMappedRate(value: unknown): unknown {
  try { return providerRateText(value); }
  catch { return value; }
}
export function providerRatesEqual(left: unknown, right: unknown): boolean {
  const a = typeof left === "string" ? left.trim().replace(/%$/, "") : "",
    b = typeof right === "string" ? right.trim().replace(/%$/, "") : "";
  if (!a || !b) return false;
  if (numericRate(a) || numericRate(b)) {
    if (!numericRate(a) || !numericRate(b)) return false;
    try {
      const x = providerDecimal(providerRateText(a), 4), y = providerDecimal(providerRateText(b), 4);
      return x.n * y.d === y.n * x.d;
    } catch { return false; }
  }
  return a === b;
}
export function providerMappedLines(lines: Record<string, unknown>[]) {
  return lines.map(line => ({ ...line,
    quantity: providerMappedDecimal(line.quantity, 6, true),
    unit_price: providerMappedDecimal(line.unit_price ?? line.price ?? line.unit_price, 6),
    vat_rate: providerMappedRate(line.vat_rate),
  }));
}

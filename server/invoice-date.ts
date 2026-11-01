import { businessDateKey } from "./business-date.js";
/** Invoice calendar days are in the business timezone, independent of browser/server timezone. */
export function invoiceBusinessDate(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? businessDateKey(date) : "";
}
export const invoiceToday = () => businessDateKey();

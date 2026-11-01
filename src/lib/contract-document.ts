/** A saved empty value is intentional. Only absent snapshot fields use current settings. */
export function savedSellerValue(seller: Record<string, unknown> | null | undefined, key: string, fallback?: unknown): string {
  return String(seller && Object.prototype.hasOwnProperty.call(seller, key) ? seller[key] ?? '' : fallback ?? '');
}

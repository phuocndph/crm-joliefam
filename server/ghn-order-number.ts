/** Legacy GHN recipient-name convention. This never establishes an order link. */
export function extractGhnOrderNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.match(/_(\d{3,5})(?:[pPhH]|\s*hoan)?\s*$/i)?.[1] ?? value.match(/_(\d{3,5})\b/)?.[1] ?? value.match(/(?:^|[\s-])(\d{3,5})\s*(?:p|h|hoan)\s*$/i)?.[1] ?? null;
}

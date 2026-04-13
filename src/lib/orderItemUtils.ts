/**
 * Shared utility for parsing and normalizing order items
 * Used by CreateGHNOrderDialog and EditGHNOrderDialog
 */

export interface NormalizedOrderItem {
  name: string;
  quantity: number;
  weight: number; // grams
}

/**
 * Parse order.items which can be:
 * - A JSON string (from CreateOrderForm: JSON.stringify(orderItems))
 * - An array (already parsed by Supabase)
 * - null/undefined
 * 
 * Item schema varies:
 * - CreateOrderForm: { product: { name }, quantity, ... }
 * - CreateQuoteForm: { name, quantity, ... }
 */
export function parseOrderItems(items: any): NormalizedOrderItem[] {
  let parsed: any[] = [];

  if (!items) return [];

  // If it's a string, try to parse as JSON
  if (typeof items === 'string') {
    try {
      parsed = JSON.parse(items);
    } catch {
      return [];
    }
  } else if (Array.isArray(items)) {
    parsed = items;
  } else {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return [];

  return parsed.map((item: any, index: number) => {
    // Resolve name: item.name > item.product?.name > fallback
    const name = item.name || item.product?.name || `Sản phẩm ${index + 1}`;
    const quantity = Number(item.quantity) || 1;
    // Default ~200g per item
    const weight = Number(item.weight) || 200;

    return { name, quantity, weight };
  });
}

/**
 * Generate a content string for GHN from normalized items
 * Format: "Ga chun x2\nVỏ gối x1"
 */
export function generateGHNContent(items: NormalizedOrderItem[]): string {
  if (items.length === 0) return "Hàng hóa";
  return items
    .map(item => item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name)
    .join('\n');
}

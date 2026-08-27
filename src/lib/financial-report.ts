import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  getQuarter,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";

export type FinancialGranularity = "day" | "month" | "quarter" | "year";

export interface DateRangeValue {
  from: Date;
  to: Date;
}

export interface RevenueBreakdown {
  amount: number;
  estimated: boolean;
  source: "order_subtotal" | "quote_subtotal" | "items" | "vat_adjusted" | "total_amount_estimated" | "missing";
}

export interface CostBreakdown {
  amount: number;
  estimated: boolean;
  missing: boolean;
  source: "order" | "items" | "products_estimated" | "missing";
}

export interface RecognitionDate {
  date: Date | null;
  estimated: boolean;
  source: "delivered_date" | "completed_at" | "updated_at_estimated" | "missing";
}

export interface FinancialPeriodRow {
  key: string;
  label: string;
  from: Date;
  to: Date;
  revenue: number;
  costPrice: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cashReceived: number;
  orders: number;
  estimatedRevenueOrders: number;
  estimatedCostOrders: number;
  missingCostOrders: number;
}

const asNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseItems = (rawItems: unknown): Array<Record<string, unknown>> => {
  if (!rawItems) return [];
  try {
    const parsed = typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
};

const validDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getRecognitionDate = (order: Record<string, unknown>): RecognitionDate => {
  if (!["delivered", "self_delivered"].includes(String(order.status))) {
    return { date: null, estimated: false, source: "missing" };
  }

  const deliveredDate = validDate(order.delivered_date);
  if (deliveredDate) return { date: deliveredDate, estimated: false, source: "delivered_date" };

  const completedAt = validDate(order.completed_at);
  if (completedAt) return { date: completedAt, estimated: false, source: "completed_at" };

  const updatedAt = validDate(order.updated_at);
  if (updatedAt) return { date: updatedAt, estimated: true, source: "updated_at_estimated" };

  return { date: null, estimated: true, source: "missing" };
};

export const getRevenueBeforeVat = (
  order: Record<string, unknown>,
  quote?: Record<string, unknown>,
): RevenueBreakdown => {
  const orderSubtotal = asNumber(order.subtotal);
  if (orderSubtotal !== null && orderSubtotal >= 0) {
    return { amount: orderSubtotal, estimated: false, source: "order_subtotal" };
  }

  const quoteSubtotal = asNumber(quote?.subtotal);
  if (quoteSubtotal !== null && quoteSubtotal >= 0) {
    return { amount: quoteSubtotal, estimated: false, source: "quote_subtotal" };
  }

  const items = parseItems(order.items);
  const itemSubtotal = items.reduce((sum, item) => {
    const storedTotal = asNumber(item.total);
    if (storedTotal !== null) return sum + storedTotal;
    const quantity = asNumber(item.quantity) ?? 0;
    const price = asNumber(item.price) ?? 0;
    return sum + quantity * price;
  }, 0);
  if (itemSubtotal > 0) {
    return { amount: itemSubtotal, estimated: false, source: "items" };
  }

  const totalAmount = asNumber(order.total_amount) ?? 0;
  const vatAmount = asNumber(order.vat_amount) ?? asNumber(quote?.vat_amount);
  const includeVat = order.include_vat === true || quote?.include_vat === true;
  if (includeVat && vatAmount !== null && vatAmount >= 0) {
    return { amount: Math.max(0, totalAmount - vatAmount), estimated: false, source: "vat_adjusted" };
  }

  const vatRate = asNumber(order.vat_rate) ?? asNumber(quote?.vat_rate);
  if (includeVat && vatRate !== null && vatRate > 0) {
    return {
      amount: totalAmount / (1 + vatRate / 100),
      estimated: true,
      source: "vat_adjusted",
    };
  }

  if (totalAmount > 0) {
    return { amount: totalAmount, estimated: true, source: "total_amount_estimated" };
  }

  return { amount: 0, estimated: true, source: "missing" };
};

export const getCostBreakdown = (
  order: Record<string, unknown>,
  products: Map<string, { cost_price?: number | null }>,
): CostBreakdown => {
  const orderCost = asNumber(order.cost_price);
  if (orderCost !== null && orderCost > 0) {
    return {
      amount: orderCost,
      estimated: order.cost_price_is_estimated === true || String(order.cost_price_source || "") === "product_estimated",
      missing: false,
      source: "order",
    };
  }

  const items = parseItems(order.items);
  const storedItemCost = items.reduce((sum, item) => {
    const totalCost = asNumber(item.total_cost);
    if (totalCost !== null) return sum + totalCost;
    const unitCost = asNumber(item.cost_price);
    const quantity = asNumber(item.quantity) ?? 0;
    return sum + (unitCost !== null ? unitCost * quantity : 0);
  }, 0);
  if (storedItemCost > 0) {
    return { amount: storedItemCost, estimated: false, missing: false, source: "items" };
  }

  const productCost = items.reduce((sum, item) => {
    const productId = item.originalProductId || (item.product as Record<string, unknown> | undefined)?.id || item.id;
    const sku = item.sku || (item.product as Record<string, unknown> | undefined)?.sku;
    const product = products.get(String(productId)) || products.get(String(sku));
    const quantity = asNumber(item.quantity) ?? 0;
    return sum + quantity * (asNumber(product?.cost_price) ?? 0);
  }, 0);
  if (productCost > 0) {
    return { amount: productCost, estimated: true, missing: false, source: "products_estimated" };
  }

  return { amount: 0, estimated: true, missing: true, source: "missing" };
};

export const getPeriodStart = (date: Date, granularity: FinancialGranularity): Date => {
  if (granularity === "day") return startOfDay(date);
  if (granularity === "month") return startOfMonth(date);
  if (granularity === "quarter") return startOfQuarter(date);
  return startOfYear(date);
};

export const getPeriodEnd = (date: Date, granularity: FinancialGranularity): Date => {
  if (granularity === "day") return endOfDay(date);
  if (granularity === "month") return endOfMonth(date);
  if (granularity === "quarter") return endOfQuarter(date);
  return endOfYear(date);
};

export const getNextPeriodStart = (date: Date, granularity: FinancialGranularity): Date => {
  if (granularity === "day") return startOfDay(addDays(date, 1));
  if (granularity === "month") return startOfMonth(addMonths(date, 1));
  if (granularity === "quarter") return startOfQuarter(addQuarters(date, 1));
  return startOfYear(addYears(date, 1));
};

export const getPeriodKey = (date: Date, granularity: FinancialGranularity): string =>
  format(
    getPeriodStart(date, granularity),
    granularity === "day" ? "yyyy-MM-dd" : granularity === "month" ? "yyyy-MM" : granularity === "quarter" ? "yyyy-'Q'Q" : "yyyy",
  );

export const getPeriodLabel = (date: Date, granularity: FinancialGranularity): string => {
  if (granularity === "day") return format(date, "dd/MM/yyyy");
  if (granularity === "month") return format(date, "MM/yyyy");
  if (granularity === "quarter") return `Quý ${getQuarter(date)}/${format(date, "yyyy")}`;
  return format(date, "yyyy");
};

export const isDateInRange = (date: Date | null, range?: DateRangeValue): boolean =>
  Boolean(date && range && date >= range.from && date <= range.to);

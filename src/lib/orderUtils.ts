// Utility functions for order display and management

export interface OrderDisplay {
  id: string;
  order_number: string;
  display_order_number?: string;
}

/**
 * Get the display name for an order
 * Returns display_order_number if set, otherwise returns order_number
 */
export const getOrderDisplayNumber = (order: OrderDisplay): string => {
  return order.display_order_number || order.order_number;
};

/**
 * Format order number for display consistently across the app
 */
export const formatOrderNumber = (order: OrderDisplay): string => {
  return getOrderDisplayNumber(order);
};
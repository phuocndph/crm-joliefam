type OrderCustomerDisplay = {
  customer_id?: string | null;
  customers?: { name?: string | null } | null;
  quote_customer_name?: string | null;
};

export const usesQuoteCustomerName = (order?: OrderCustomerDisplay | null) =>
  Boolean(order && order.customer_id === null && !order.customers?.name?.trim() && order.quote_customer_name?.trim());

// A quote snapshot is a display label, never a canonical customer relationship.
export const orderCustomerName = (order?: OrderCustomerDisplay | null) =>
  order?.customers?.name?.trim() || (usesQuoteCustomerName(order) ? order?.quote_customer_name?.trim() : '') || 'Khách lẻ';

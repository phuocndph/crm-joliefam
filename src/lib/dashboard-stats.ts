import { supabase } from "@/integrations/supabase/client";

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuotes: number;
  totalProducts: number;
  pendingOrders: number;
  approvedQuotes: number;
  monthlyRevenue: number;
  previousMonthRevenue: number;
  monthlyOrders: number;
  monthlyCustomers: number;
}

const emptyStats: DashboardStats = {
  totalRevenue: 0, totalOrders: 0, totalCustomers: 0, totalQuotes: 0,
  totalProducts: 0, pendingOrders: 0, approvedQuotes: 0, monthlyRevenue: 0, previousMonthRevenue: 0,
  monthlyOrders: 0, monthlyCustomers: 0,
};

/** Loads dashboard statistics while avoiding full orders/quotes table downloads. */
export const loadDashboardStats = async (): Promise<DashboardStats> => {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const monthStart = currentMonth.toISOString();
  const nextMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1).toISOString();
  const previousMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1).toISOString();

  // Prefer a database aggregate so the browser does not download every
  // delivered order. Keep the paginated path as a compatibility fallback until
  // the reporting migration is deployed to the project.
  const fetchOrderAmounts = async (from?: string, to?: string) => {
    const { data: aggregate, error: aggregateError } = await supabase.rpc('get_dashboard_revenue', {
      p_from: from ?? null,
      p_to: to ?? null,
    });
    if (!aggregateError && aggregate !== null && Number.isFinite(Number(aggregate))) {
      return Number(aggregate);
    }

    const rows: Array<{ total_amount: number | null }> = [];
    const PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = supabase
        .from("orders")
        .select("total_amount")
        .in("status", ["delivered", "self_delivered"])
        .range(offset, offset + PAGE_SIZE - 1);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lt("created_at", to);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows.reduce((sum, row) => sum + (row.total_amount || 0), 0);
  };

  const [ordersTotal, pendingOrders, monthlyOrders, deliveredOrders, monthlyDeliveredOrders,
    previousMonthDeliveredOrders, customersTotal, monthlyCustomers, quotesTotal, approvedQuotes, productsCount] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    fetchOrderAmounts(),
    fetchOrderAmounts(monthStart, nextMonthStart),
    fetchOrderAmounts(previousMonthStart, monthStart),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }).gte("created_at", monthStart).lt("created_at", nextMonthStart),
    supabase.from("quotes").select("id", { count: "exact", head: true }),
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);

  const firstError = [ordersTotal.error, pendingOrders.error, monthlyOrders.error,
    customersTotal.error, monthlyCustomers.error,
    quotesTotal.error, approvedQuotes.error, productsCount.error].find(Boolean);
  if (firstError) throw firstError;

  return {
    ...emptyStats,
    totalRevenue: deliveredOrders,
    totalOrders: ordersTotal.count ?? 0,
    totalCustomers: customersTotal.count ?? 0,
    totalQuotes: quotesTotal.count ?? 0,
    totalProducts: productsCount.count ?? 0,
    pendingOrders: pendingOrders.count ?? 0,
    approvedQuotes: approvedQuotes.count ?? 0,
    monthlyRevenue: monthlyDeliveredOrders,
    previousMonthRevenue: previousMonthDeliveredOrders,
    monthlyOrders: monthlyOrders.count ?? 0,
    monthlyCustomers: monthlyCustomers.count ?? 0,
  };
};

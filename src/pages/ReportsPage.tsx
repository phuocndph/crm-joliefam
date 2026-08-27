import { useState, useCallback, useMemo, useEffect } from "react";
import ReportOverviewDetails from "@/components/reports/ReportOverviewDetails";
import ReportSalesDetails from "@/components/reports/ReportSalesDetails";
import ReportFinancialDetails from "@/components/reports/ReportFinancialDetails";
import ReportCustomerDetails from "@/components/reports/ReportCustomerDetails";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart, Users, ShoppingCart, Plus, DollarSign, Package, CheckCircle, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, LineChart, Line, Pie, AreaChart, Area } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, differenceInDays, startOfDay, endOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import type { User } from "@supabase/supabase-js";
import {
  getCostBreakdown,
  getNextPeriodStart,
  getPeriodEnd,
  getPeriodKey,
  getPeriodLabel,
  getPeriodStart,
  getRecognitionDate,
  getRevenueBeforeVat,
  isDateInRange,
  type FinancialGranularity,
  type FinancialPeriodRow,
} from "@/lib/financial-report";

const EXCLUDED_SALES_STATUSES = new Set(["cancelled", "returned"]);
const RECOGNIZED_REVENUE_STATUSES = new Set(["delivered", "self_delivered"]);
const BASE_ORDER_REPORT_SELECT = `
  id, order_number, display_order_number, customer_id, quote_id,
  total_amount, cost_price, payment_status, status, created_at,
  delivered_date, updated_at, items,
  customers (id, name, customer_code)
`;
const FINANCIAL_ORDER_REPORT_SELECT = `${BASE_ORDER_REPORT_SELECT},
  subtotal, vat_amount, vat_rate, include_vat,
  cost_price_source, cost_price_is_estimated
`;

const ReportsPage = () => {
  // Keep the normal report request bounded. Users can still select an older
  // period explicitly from the date picker when historical analysis is needed.
  const defaultReportFrom = useMemo(() => startOfDay(subMonths(new Date(), 12)), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: defaultReportFrom,
    to: endOfDay(new Date())
  });
  const [activeTab, setActiveTab] = useState("overview");
  const [financialGranularity, setFinancialGranularity] = useState<FinancialGranularity>("month");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { role: currentUserRole, loading: roleLoading } = useUserRole(currentUser);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(currentUser, currentUserRole);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    // Do not redirect while the session role is still being resolved. A newly
    // mounted page briefly has a null role, which must not be treated as a
    // denied `reports` permission for managers/admins.
    if (!currentUser || roleLoading || permissionLoading || !currentUserRole) return;
    if (!hasPermission("reports")) navigate("/dashboard", { replace: true });
  }, [currentUser, currentUserRole, roleLoading, permissionLoading, hasPermission, navigate]);

  useEffect(() => {
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined;
    const invalidateReports = () => {
      // Batch updates such as GHN/status sync can emit several events in a
      // short burst. One refetch is enough for the resulting report state.
      if (invalidationTimer) clearTimeout(invalidationTimer);
      invalidationTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["orders-reports"] });
        queryClient.invalidateQueries({ queryKey: ["customers-reports"] });
        queryClient.invalidateQueries({ queryKey: ["expenses-reports"] });
        queryClient.invalidateQueries({ queryKey: ["order-payments-reports"] });
        queryClient.invalidateQueries({ queryKey: ["order-payments-for-report-orders"] });
        queryClient.invalidateQueries({ queryKey: ["products-batch-reports"] });
      }, 1000);
    };
    const channel = supabase
      .channel(`reports-sync-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidateReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, invalidateReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, invalidateReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, invalidateReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, invalidateReports)
      .subscribe();

    return () => {
      if (invalidationTimer) clearTimeout(invalidationTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Normalize date-only picker values so the selected end date is inclusive.
  const normalizedDateRange = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return undefined;
    return { from: startOfDay(dateRange.from), to: endOfDay(dateRange.to) };
  }, [dateRange]);

  // Include the immediately preceding period so comparison metrics retain their
  // existing behavior while the server still filters out unrelated history.
  const reportQueryRange = useMemo(() => {
    const from = normalizedDateRange?.from || defaultReportFrom;
    const to = normalizedDateRange?.to || endOfDay(new Date());
    const days = differenceInDays(to, from);
    const previousFrom = new Date(from);
    previousFrom.setDate(previousFrom.getDate() - days - 1);
    return {
      // Also include the 12-month chart window, even when the selected range
      // is short and starts later than the first chart month.
      from: startOfDay(new Date(Math.min(previousFrom.getTime(), subMonths(startOfMonth(to), 11).getTime()))),
      to: endOfDay(to),
    };
  }, [normalizedDateRange, defaultReportFrom]);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders-reports", reportQueryRange.from.toISOString(), reportQueryRange.to.toISOString()],
    queryFn: async () => {
      const fetchByDate = async (column: "created_at" | "delivered_date" | "updated_at") => {
        const rows: any[] = [];
        for (let offset = 0; ; offset += 1000) {
          const makeQuery = (selectColumns: string) => supabase
            .from("orders")
            .select(selectColumns)
            .gte(column, reportQueryRange.from.toISOString())
            .lte(column, reportQueryRange.to.toISOString())
            .order(column, { ascending: true });
          // Try the snapshot columns first, then fall back to the pre-migration
          // shape so existing deployments continue to load reports.
          let query = makeQuery(FINANCIAL_ORDER_REPORT_SELECT);
          if (column === "updated_at") query = query.is("delivered_date", null);
          if (column !== "created_at") query = query.in("status", Array.from(RECOGNIZED_REVENUE_STATUSES));
          let result = await query.range(offset, offset + 999);
          if (result.error) {
            let legacyQuery = makeQuery(BASE_ORDER_REPORT_SELECT);
            if (column === "updated_at") legacyQuery = legacyQuery.is("delivered_date", null);
            if (column !== "created_at") legacyQuery = legacyQuery.in("status", Array.from(RECOGNIZED_REVENUE_STATUSES));
            result = await legacyQuery.range(offset, offset + 999);
          }
          const { data, error } = result;
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        return rows;
      };

      const [createdRows, deliveredRows, updatedRows] = await Promise.all([
        fetchByDate("created_at"),
        fetchByDate("delivered_date"),
        // Needed for legacy delivered orders without delivered_date. The
        // financial helper marks this recognition date as estimated.
        fetchByDate("updated_at"),
      ]);
      const byId = new Map<string, any>();
      [...createdRows, ...deliveredRows, ...updatedRows].forEach(row => byId.set(row.id, row));
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const reportQuoteIds = useMemo(
    () => Array.from(new Set(orders.map(order => order.quote_id).filter(Boolean))),
    [orders],
  );

  const { data: reportQuotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ["quotes-reports", reportQuoteIds],
    queryFn: async () => {
      const rows: Array<Record<string, unknown>> = [];
      for (let index = 0; index < reportQuoteIds.length; index += 200) {
        const { data, error } = await supabase
          .from("quotes")
          .select("id, subtotal, total_amount, vat_amount, vat_rate, include_vat, items")
          .in("id", reportQuoteIds.slice(index, index + 200));
        // Quotes are an enrichment source only. A restricted/legacy quotes
        // table must not take the whole report offline; order/item fallbacks
        // still provide a usable estimate.
        if (error) {
          console.warn("Không thể tải dữ liệu báo giá cho báo cáo:", error.message);
          return [];
        }
        rows.push(...(data || []));
      }
      return rows;
    },
    enabled: reportQuoteIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const quotesMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    reportQuotes.forEach(quote => {
      if (typeof quote.id === "string") map.set(quote.id, quote);
    });
    return map;
  }, [reportQuotes]);
  
  const reportCustomerIds = useMemo(
    () => Array.from(new Set(orders.map(order => order.customer_id).filter(Boolean))),
    [orders],
  );

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers-reports", reportCustomerIds],
    queryFn: async () => {
      if (reportCustomerIds.length === 0) return [];
      const rows: any[] = [];
      for (let offset = 0; offset < reportCustomerIds.length; offset += 200) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, customer_code, created_at, total_spent, purchase_count, last_purchase_date")
          .in("id", reportCustomerIds.slice(offset, offset + 200));
        if (error) throw error;
        rows.push(...(data || []));
      }
      return rows;
    },
    enabled: reportCustomerIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
  
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses-reports", reportQueryRange.from.toISOString(), reportQueryRange.to.toISOString()],
    queryFn: async () => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("expenses")
          .select("id, amount, category, expense_date")
          .gte("expense_date", reportQueryRange.from.toISOString())
          .lte("expense_date", reportQueryRange.to.toISOString())
          .order("expense_date", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const { data: orderPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["order-payments-reports", reportQueryRange.from.toISOString(), reportQueryRange.to.toISOString()],
    queryFn: async () => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("order_payments")
          .select("id, order_id, payment_amount, payment_date")
          .gte("payment_date", reportQueryRange.from.toISOString())
          .lte("payment_date", reportQueryRange.to.toISOString())
          .order("payment_date", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const reportOrderIds = useMemo(() => orders.map(order => order.id), [orders]);

  // Cash flow only needs payments in the selected/comparison range, while
  // receivable needs each selected order's full payment history.
  const { data: allOrderPayments = [], isLoading: allPaymentsLoading } = useQuery({
    queryKey: ["order-payments-for-report-orders", reportOrderIds],
    queryFn: async () => {
      const rows: any[] = [];
      const CHUNK_SIZE = 200;

      for (let index = 0; index < reportOrderIds.length; index += CHUNK_SIZE) {
        const { data, error } = await supabase
          .from("order_payments")
          .select("id, order_id, payment_amount, payment_date")
          .in("order_id", reportOrderIds.slice(index, index + CHUNK_SIZE));
        if (error) throw error;
        rows.push(...(data || []));
      }

      return rows;
    },
    enabled: reportOrderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Batch fetch all products data needed for cost calculations
  const getAllProductIdentifiers = useCallback(() => {
    const productIds = new Set<string>();
    const productSkus = new Set<string>();
    
    orders.forEach(order => {
      if (order.items) {
        try {
          const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
          orderItems.forEach((item: any) => {
            const productId = item.originalProductId || item.product?.id || item.id;
            if (productId) {
              productIds.add(productId);
            }
            const sku = item.sku || item.product?.sku;
            if (sku) {
              productSkus.add(sku);
            }
          });
        } catch (error) {
          console.error('Error parsing order items:', error);
        }
      }
    });
    
    return { productIds: Array.from(productIds), productSkus: Array.from(productSkus) };
  }, [orders]);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products-batch-reports', getAllProductIdentifiers()],
    queryFn: async () => {
      const { productIds, productSkus } = getAllProductIdentifiers();
      
      if (productIds.length === 0 && productSkus.length === 0) {
        return [];
      }

      let allProducts: any[] = [];

      // Fetch by IDs
      if (productIds.length > 0) {
        const { data: idData, error: idError } = await supabase
          .from('products')
          .select('id, sku, cost_price')
          .in('id', productIds);
        if (idError) throw idError;
        if (idData) allProducts = [...allProducts, ...idData];
      }

      // Fetch by SKUs for any missing products
      if (productSkus.length > 0) {
        const remainingSkus = productSkus.filter(sku => {
          return !allProducts.some(p => p.sku === sku);
        });
        
        if (remainingSkus.length > 0) {
          const { data: skuData, error: skuError } = await supabase
            .from('products')
            .select('id, sku, cost_price')
            .in('sku', remainingSkus);
          if (skuError) throw skuError;
          if (skuData) allProducts = [...allProducts, ...skuData];
        }
      }

      return allProducts;
    },
    enabled: orders.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Create products lookup map for fast access
  const productsMap = useMemo(() => {
    const map = new Map<string, any>();
    products.forEach(product => {
      map.set(product.id, product);
      if (product.sku) {
        map.set(product.sku, product);
      }
    });
    return map;
  }, [products]);

  // Check if data is still loading
  const isLoading = ordersLoading || quotesLoading || expensesLoading || productsLoading || customersLoading || paymentsLoading || allPaymentsLoading;

  // Filter data based on date range
  const filteredOrders = useMemo(() => {
    if (!normalizedDateRange) return orders;
    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= normalizedDateRange.from && orderDate <= normalizedDateRange.to;
    });
  }, [orders, normalizedDateRange]);

  const filteredCustomers = useMemo(() => {
    if (!normalizedDateRange) return customers;
    return customers.filter(customer => {
      const customerDate = new Date(customer.created_at);
      return customerDate >= normalizedDateRange.from && customerDate <= normalizedDateRange.to;
    });
  }, [customers, normalizedDateRange]);

  const filteredExpenses = useMemo(() => {
    if (!normalizedDateRange) return expenses;
    return expenses.filter(expense => {
      const expenseDate = new Date(expense.expense_date);
      return expenseDate >= normalizedDateRange.from && expenseDate <= normalizedDateRange.to;
    });
  }, [expenses, normalizedDateRange]);

  const filteredPayments = useMemo(() => {
    if (!normalizedDateRange) return orderPayments;
    return orderPayments.filter(payment => {
      const paymentDate = new Date(payment.payment_date);
      return paymentDate >= normalizedDateRange.from && paymentDate <= normalizedDateRange.to;
    });
  }, [orderPayments, normalizedDateRange]);

  // Deduplicated customers to avoid counting the same customer multiple times
  const deduplicatedCustomers = useMemo(() => {
    const seen = new Set();
    return customers.filter(customer => {
      if (seen.has(customer.id)) return false;
      seen.add(customer.id);
      return true;
    });
  }, [customers]);

  const salesOrders = useMemo(
    () => filteredOrders.filter(order => !EXCLUDED_SALES_STATUSES.has(order.status)),
    [filteredOrders]
  );

  const eligibleOrderIds = useMemo(
    () => new Set(orders.filter(order => !EXCLUDED_SALES_STATUSES.has(order.status)).map(order => order.id)),
    [orders]
  );

  const financialRange = useMemo(() => normalizedDateRange || {
    from: defaultReportFrom,
    to: endOfDay(new Date()),
  }, [normalizedDateRange, defaultReportFrom]);

  // Financial recognition is driven by delivery, not order creation. This
  // keeps an older order visible when it is delivered during the selected
  // period while excluding undelivered orders from revenue and profit.
  const recognizedRevenueOrders = useMemo(
    () => orders.filter(order => {
      if (EXCLUDED_SALES_STATUSES.has(order.status) || !RECOGNIZED_REVENUE_STATUSES.has(order.status)) {
        return false;
      }
      return isDateInRange(getRecognitionDate(order).date, financialRange);
    }),
    [orders, financialRange]
  );

  const customersInPeriod = useMemo(() => {
    const customerIds = new Set(salesOrders.map(order => order.customer_id).filter(Boolean));
    return deduplicatedCustomers.filter(customer => customerIds.has(customer.id));
  }, [salesOrders, deduplicatedCustomers]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Helper function to calculate order cost price synchronously
  const getOrderCostBreakdown = useCallback((order: any) => getCostBreakdown(order, productsMap), [productsMap]);
  const calculateOrderCostPrice = useCallback(
    (order: any) => getOrderCostBreakdown(order).amount,
    [getOrderCostBreakdown],
  );

  // Calculate comparison metrics with previous period
  const comparisonData = useMemo(() => {
    if (!normalizedDateRange) return null;

    const daysDiff = differenceInDays(normalizedDateRange.to, normalizedDateRange.from);
    const previousFrom = new Date(normalizedDateRange.from);
    previousFrom.setDate(previousFrom.getDate() - daysDiff - 1);
    const previousTo = new Date(normalizedDateRange.from);
    previousTo.setDate(previousTo.getDate() - 1);
    const previousFromStart = startOfDay(previousFrom);
    const previousToEnd = endOfDay(previousTo);

    const previousOrderSales = orders.filter(order => {
      const createdAt = new Date(order.created_at);
      return !EXCLUDED_SALES_STATUSES.has(order.status) && createdAt >= previousFromStart && createdAt <= previousToEnd;
    });
    const previousRecognizedOrders = orders.filter(order => {
      if (EXCLUDED_SALES_STATUSES.has(order.status)) return false;
      const recognitionDate = getRecognitionDate(order).date;
      return isDateInRange(recognitionDate, { from: previousFromStart, to: previousToEnd });
    });
    const previousRevenue = previousRecognizedOrders.reduce((sum, order) => {
      return sum + getRevenueBeforeVat(order, quotesMap.get(order.quote_id)).amount;
    }, 0);
    const previousOrderCount = previousOrderSales.length;
    const previousCompletedOrders = previousRecognizedOrders.length;
    const previousCustomerIds = new Set(previousOrderSales.map(order => order.customer_id).filter(Boolean));
    const previousCustomerCount = customers.filter(customer => {
      const createdAt = new Date(customer.created_at);
      return previousCustomerIds.has(customer.id) && createdAt >= previousFromStart && createdAt <= previousToEnd;
    }).length;

    return {
      previousRevenue,
      previousOrderCount,
      previousCompletedOrders,
      previousCustomerCount,
    };
  }, [orders, customers, normalizedDateRange, quotesMap]);

  // Optimized metrics calculation using useMemo
  const metricsData = useMemo(() => {
    const recognizedRevenue = recognizedRevenueOrders.reduce((sum, order) => {
      return sum + getRevenueBeforeVat(order, quotesMap.get(order.quote_id)).amount;
    }, 0);
    const salesOrderRevenue = salesOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalOrderRevenue = recognizedRevenue;
    
    // Calculate total cost price synchronously
    const totalCostPrice = recognizedRevenueOrders.reduce((sum, order) => sum + calculateOrderCostPrice(order), 0);
    
    const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Calculate actual paid amount - only from payments related to filtered orders
    const salesOrderIds = new Set(salesOrders.map(o => o.id));
    const paymentsForSalesOrders = allOrderPayments.filter(p => p.order_id && salesOrderIds.has(p.order_id));
    const paidByOrder = new Map<string, number>();
    paymentsForSalesOrders.forEach(payment => {
      if (!payment.order_id) return;
      paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) || 0) + Number(payment.payment_amount || 0));
    });
    const actualPaidAmountTotal = paymentsForSalesOrders.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
    const paidInPeriod = filteredPayments
      .filter(p => p.order_id && salesOrderIds.has(p.order_id))
      .reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);

    const totalOrderAmount = salesOrderRevenue;
    const remainingAmount = Math.max(0, totalOrderAmount - actualPaidAmountTotal);

    const grossProfit = recognizedRevenue - totalCostPrice;
    const netProfit = grossProfit - totalExpensesAmount;
    const completedOrders = recognizedRevenueOrders.length;
    const pendingOrders = salesOrders.filter(o => ["pending", "processing"].includes(o.status)).length;
    const totalOrders = salesOrders.length;

    // Payment status calculations
    const paymentState = (order: any) => {
      const total = Number(order.total_amount || 0);
      const paid = paidByOrder.get(order.id) || 0;
      return paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";
    };
    const paidOrders = salesOrders.filter(o => paymentState(o) === "paid").length;
    const partialPaidOrders = salesOrders.filter(o => paymentState(o) === "partial").length;
    const unpaidOrders = salesOrders.filter(o => paymentState(o) === "pending").length;

    // Customer metrics
    const newCustomers = filteredCustomers.filter(customer => customersInPeriod.some(c => c.id === customer.id)).length;
    const totalCustomers = customersInPeriod.length;

    const averageOrderValue = totalOrders > 0 ? salesOrderRevenue / totalOrders : 0;
    const averageDailyRevenue = normalizedDateRange ? totalOrderRevenue / Math.max(1, differenceInDays(normalizedDateRange.to, normalizedDateRange.from) + 1) : 0;

    // Calculate comparison percentages
    const revenueChange = comparisonData?.previousRevenue ? 
      ((totalOrderRevenue - comparisonData.previousRevenue) / comparisonData.previousRevenue) * 100 : 0;
    const orderCountChange = comparisonData?.previousOrderCount ? 
      ((totalOrders - comparisonData.previousOrderCount) / comparisonData.previousOrderCount) * 100 : 0;
    const completedOrdersChange = comparisonData?.previousCompletedOrders ? 
      ((completedOrders - comparisonData.previousCompletedOrders) / comparisonData.previousCompletedOrders) * 100 : 0;
    const customerGrowth = comparisonData?.previousCustomerCount ?
      ((newCustomers - comparisonData.previousCustomerCount) / comparisonData.previousCustomerCount) * 100 : 0;

    return {
      totalOrderRevenue,
      salesOrderRevenue,
      recognizedRevenue,
      totalCostPrice,
      totalExpensesAmount,
      actualPaidAmountTotal,
      paidInPeriod,
      remainingAmount,
      grossProfit,
      netProfit,
      completedOrders,
      pendingOrders,
      totalOrders,
      paidOrders,
      partialPaidOrders,
      unpaidOrders,
      newCustomers,
      totalCustomers,
      averageOrderValue,
      averageDailyRevenue,
      revenueChange,
      orderCountChange,
      completedOrdersChange,
      customerGrowth,
    };
  }, [salesOrders, recognizedRevenueOrders, filteredExpenses, filteredCustomers, customersInPeriod, allOrderPayments, filteredPayments, normalizedDateRange, calculateOrderCostPrice, comparisonData, quotesMap]);

  // Optimized monthly data calculation
  const monthlyData = useMemo(() => {
    if (!orders.length && !expenses.length) {
      return [];
    }

    const monthlyDataMap = new Map();
    const selectedTo = normalizedDateRange?.to || endOfDay(new Date());
    const endDate = endOfMonth(selectedTo);
    const startDate = startOfMonth(subMonths(selectedTo, 11));

    // Always show exactly the 12 months ending in the selected period.
    let currentMonth = startDate;
    while (currentMonth <= endDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const monthOrders = orders.filter(o => {
        const oDate = new Date(o.created_at);
        return oDate >= monthStart && oDate <= monthEnd && !EXCLUDED_SALES_STATUSES.has(o.status);
      });
      const monthRecognizedOrders = orders.filter(order => {
        if (EXCLUDED_SALES_STATUSES.has(order.status) || !RECOGNIZED_REVENUE_STATUSES.has(order.status)) return false;
        return isDateInRange(getRecognitionDate(order).date, { from: monthStart, to: monthEnd });
      });
      
      const monthExpenses = expenses.filter(e => {
        const eDate = new Date(e.expense_date);
        return eDate >= monthStart && eDate <= monthEnd;
      });

      const monthPayments = orderPayments.filter(payment => {
        const paymentDate = new Date(payment.payment_date);
        return eligibleOrderIds.has(payment.order_id) && paymentDate >= monthStart && paymentDate <= monthEnd;
      });
      
      const revenue = monthRecognizedOrders.reduce(
        (sum, order) => sum + getRevenueBeforeVat(order, quotesMap.get(order.quote_id)).amount,
        0,
      );
      
      // Calculate cost price synchronously using cached products data
      const totalCostPrice = monthRecognizedOrders.reduce((sum, order) => sum + calculateOrderCostPrice(order), 0);
      
      const expensesAmount = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const cashReceived = monthPayments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
      const ordersCount = monthOrders.length;
      const completedCount = monthRecognizedOrders.length;
      
      const monthKey = format(currentMonth, "MMM yyyy", { locale: vi });
      const monthKeySort = format(currentMonth, "yyyy-MM");
      monthlyDataMap.set(monthKeySort, {
        month: monthKey,
        revenue,
        costPrice: totalCostPrice,
        expenses: expensesAmount,
        cashReceived,
        netCashFlow: cashReceived - expensesAmount,
        grossProfit: revenue - totalCostPrice,
        profit: revenue - totalCostPrice - expensesAmount,
        orders: ordersCount,
        completed: completedCount,
        sortKey: monthKeySort
      });
      
      // Move to next month
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }
    
    // Convert to array and sort by date
    return Array.from(monthlyDataMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [orders, expenses, orderPayments, normalizedDateRange, calculateOrderCostPrice, eligibleOrderIds, quotesMap]);

  const financialPeriodData = useMemo<FinancialPeriodRow[]>(() => {
    if (!financialRange) return [];

    const rows: FinancialPeriodRow[] = [];
    let periodStart = getPeriodStart(financialRange.from, financialGranularity);
    const lastPeriodStart = getPeriodStart(financialRange.to, financialGranularity);
    while (periodStart <= lastPeriodStart) {
      const periodEnd = getPeriodEnd(periodStart, financialGranularity);
      const range = { from: periodStart, to: periodEnd };
      const periodOrders = recognizedRevenueOrders.filter(order => isDateInRange(getRecognitionDate(order).date, range));
      const periodExpenses = filteredExpenses.filter(expense => isDateInRange(new Date(expense.expense_date), range));
      const periodPayments = filteredPayments.filter(payment => isDateInRange(new Date(payment.payment_date), range));
      const revenueBreakdowns = periodOrders.map(order => getRevenueBeforeVat(order, quotesMap.get(order.quote_id)));
      const costBreakdowns = periodOrders.map(getOrderCostBreakdown);
      const revenue = revenueBreakdowns.reduce((sum, item) => sum + item.amount, 0);
      const costPrice = costBreakdowns.reduce((sum, item) => sum + item.amount, 0);
      const expensesAmount = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      rows.push({
        key: getPeriodKey(periodStart, financialGranularity),
        label: getPeriodLabel(periodStart, financialGranularity),
        from: periodStart,
        to: periodEnd,
        revenue,
        costPrice,
        grossProfit: revenue - costPrice,
        expenses: expensesAmount,
        netProfit: revenue - costPrice - expensesAmount,
        cashReceived: periodPayments.reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0),
        orders: periodOrders.length,
        estimatedRevenueOrders: revenueBreakdowns.filter(item => item.estimated).length,
        estimatedCostOrders: costBreakdowns.filter(item => item.estimated && !item.missing).length,
        missingCostOrders: costBreakdowns.filter(item => item.missing).length,
      });
      periodStart = getNextPeriodStart(periodStart, financialGranularity);
    }
    return rows;
  }, [financialRange, financialGranularity, recognizedRevenueOrders, filteredExpenses, filteredPayments, quotesMap, getOrderCostBreakdown]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold">Báo cáo & Thống kê</h1>
        <div className="flex flex-col md:flex-row gap-3">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
              <Button variant="outline" className="gap-2" onClick={() => {
                const rows = [
                  ["Chỉ số", "Giá trị"],
                  ["Doanh thu ghi nhận trước VAT", Math.round(metricsData.recognizedRevenue)],
                  ["Doanh số đơn hợp lệ", Math.round(metricsData.totalOrderRevenue)],
                  ["Số đơn hợp lệ", metricsData.totalOrders],
                  ["Đơn hoàn thành", metricsData.completedOrders],
                  ["Lợi nhuận gộp", Math.round(metricsData.grossProfit)],
                  ["Chi phí", Math.round(metricsData.totalExpensesAmount)],
                  ["Lợi nhuận ròng", Math.round(metricsData.netProfit)],
                  ["Thu trong kỳ", Math.round(metricsData.paidInPeriod)],
                  ["Còn phải thu", Math.round(metricsData.remainingAmount)],
                  [],
                  [`Chi tiết theo ${financialGranularity === "day" ? "ngày" : financialGranularity === "month" ? "tháng" : financialGranularity === "quarter" ? "quý" : "năm"}`],
                  ["Kỳ", "Doanh thu trước VAT", "Giá vốn", "Lợi nhuận gộp", "Chi phí", "Lợi nhuận sau chi phí", "Đơn giao", "GV ước tính", "Thiếu GV"],
                  ...financialPeriodData.map(row => [row.label, Math.round(row.revenue), Math.round(row.costPrice), Math.round(row.grossProfit), Math.round(row.expenses), Math.round(row.netProfit), row.orders, row.estimatedCostOrders, row.missingCostOrders]),
                ];
                const csv = "\uFEFF" + rows.map(row => row.join(",")).join("\n");
                const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `bao-cao-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}>
            <Download className="h-4 w-4" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="sales">Bán hàng</TabsTrigger>
          <TabsTrigger value="financial">Tài chính</TabsTrigger>
          <TabsTrigger value="customers">Khách hàng</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {isLoading ? (
            // Skeleton loading
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng doanh thu</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(metricsData.totalOrderRevenue)}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    {metricsData.revenueChange >= 0 ? (
                      <>
                        <ArrowUpRight className="h-3 w-3 text-green-600" />
                        <span className="text-green-600 font-medium">+{metricsData.revenueChange.toFixed(1)}%</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-3 w-3 text-red-600" />
                        <span className="text-red-600 font-medium">{metricsData.revenueChange.toFixed(1)}%</span>
                      </>
                    )}
                    <span className="text-muted-foreground">so với kỳ trước</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Đơn hoàn thành</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{metricsData.completedOrders}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">
                      {metricsData.totalOrders > 0 ? Math.round((metricsData.completedOrders / metricsData.totalOrders) * 100) : 0}% lệ hoàn thành
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Đơn đang xử lý</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{metricsData.pendingOrders}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">
                      {metricsData.totalOrders > 0 ? Math.round((metricsData.pendingOrders / metricsData.totalOrders) * 100) : 0}% đang xử lý
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Giá trị TB/đơn</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(metricsData.averageOrderValue)}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">Trung bình mỗi đơn</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Additional Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng đơn hàng</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalOrders}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {metricsData.orderCountChange >= 0 ? (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-600" />
                      <span className="text-green-600 font-medium">+{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-3 w-3 text-red-600" />
                      <span className="text-red-600 font-medium">{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  )}
                  <span className="text-muted-foreground">so với kỳ trước</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Giá vốn</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(metricsData.totalCostPrice)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.totalCostPrice / metricsData.totalOrderRevenue) * 100) : 0}% của doanh thu
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận gộp</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(metricsData.grossProfit)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.grossProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metricsData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metricsData.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.netProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Revenue Growth Chart with Data Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  📈 Biểu đồ doanh thu ghi nhận 12 tháng
                </CardTitle>
                <CardDescription>Theo dõi xu hướng doanh thu, chi phí và lợi nhuận theo tháng</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading || monthlyData.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-2">
                        {isLoading ? "Đang tải dữ liệu..." : "Không có dữ liệu trong khoảng thời gian đã chọn"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-80 w-full mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 50, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="month" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis yAxisId="currency" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                            formatter={(value, name) => {
                              if (name === "revenue") return [formatCurrency(Number(value)), "Doanh thu"];
                              if (name === "costPrice") return [formatCurrency(Number(value)), "Giá vốn"];
                              if (name === "expenses") return [formatCurrency(Number(value)), "Chi phí"];
                              if (name === "grossProfit") return [formatCurrency(Number(value)), "Lợi nhuận gộp"];
                              if (name === "profit") return [formatCurrency(Number(value)), "Lợi nhuận ròng"];
                              return [formatCurrency(Number(value)), name];
                            }} labelStyle={{
                              color: '#374151',
                              fontWeight: 'bold'
                            }} />
                          <Line yAxisId="currency" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{
                            fill: "#3b82f6",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#3b82f6",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Doanh thu" />
                          <Line yAxisId="currency" type="monotone" dataKey="costPrice" stroke="#f59e0b" strokeWidth={2} dot={{
                            fill: "#f59e0b",
                            strokeWidth: 2,
                            r: 4
                          }} activeDot={{
                            r: 6,
                            stroke: "#f59e0b",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Giá vốn" />
                          <Line yAxisId="currency" type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{
                            fill: "#ef4444",
                            strokeWidth: 2,
                            r: 4
                          }} activeDot={{
                            r: 6,
                            stroke: "#ef4444",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Chi phí" />
                          <Line yAxisId="currency" type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={3} dot={{
                            fill: "#059669",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#059669",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="grossProfit" />
                          <Line yAxisId="currency" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{
                            fill: "#10b981",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#10b981",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Lợi nhuận ròng" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Data Table */}
                    <div className="border rounded-lg">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-t-lg border-b">
                        <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                          📊 Chi tiết tất cả các tháng
                        </h3>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-white">
                            <TableRow>
                              <TableHead className="font-semibold">Tháng</TableHead>
                              <TableHead className="font-semibold text-right">💰 Doanh thu</TableHead>
                              <TableHead className="font-semibold text-right">🏷️ Giá vốn</TableHead>
                              <TableHead className="font-semibold text-right">💳 Chi phí</TableHead>
                              <TableHead className="font-semibold text-right">📊 Lợi nhuận gộp</TableHead>
                              <TableHead className="font-semibold text-right">📈 Lợi nhuận ròng</TableHead>
                              <TableHead className="font-semibold text-right">📦 Đơn hàng</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlyData.map((data, index) => (
                              <TableRow key={index} className="hover:bg-gray-50">
                                <TableCell className="font-medium">{data.month}</TableCell>
                          <TableCell className="text-right font-semibold text-blue-600">
                                  {formatCurrency(data.revenue)}
                                </TableCell>
                                <TableCell className="text-right font-medium text-orange-600">
                                  {formatCurrency(data.costPrice)}
                                </TableCell>
                                <TableCell className="text-right font-medium text-red-600">
                                  {formatCurrency(data.expenses)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-emerald-600">
                                  {formatCurrency(data.grossProfit)}
                                </TableCell>
                                <TableCell className={`text-right font-bold ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(data.profit)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{data.orders}</span>
                                    <span className="text-xs text-gray-500">({data.completed} hoàn thành)</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed sections */}
          <ReportOverviewDetails filteredOrders={salesOrders} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tổng đơn hàng</CardTitle>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalOrders}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {metricsData.orderCountChange >= 0 ? (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-600" />
                      <span className="text-green-600 font-medium">+{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-3 w-3 text-red-600" />
                      <span className="text-red-600 font-medium">{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  )}
                  <span className="text-muted-foreground">so với kỳ trước</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Đơn hoàn thành</CardTitle>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metricsData.completedOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrders > 0 ? Math.round((metricsData.completedOrders / metricsData.totalOrders) * 100) : 0}% tỷ lệ hoàn thành
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Đơn đang xử lý</CardTitle>
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{metricsData.pendingOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrders > 0 ? Math.round((metricsData.pendingOrders / metricsData.totalOrders) * 100) : 0}% đang xử lý
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Giá trị TB/đơn</CardTitle>
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{formatCurrency(metricsData.averageOrderValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Trung bình mỗi đơn</p>
              </CardContent>
            </Card>
          </div>

          {/* Orders Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Thống kê đơn hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {metricsData.totalOrders > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={[
                        { name: "Hoàn thành", value: metricsData.completedOrders, fill: "#10b981" },
                        { name: "Đang xử lý", value: metricsData.pendingOrders, fill: "#f59e0b" },
                        { name: "Khác", value: Math.max(0, metricsData.totalOrders - metricsData.completedOrders - metricsData.pendingOrders), fill: "#6b7280" }
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {[
                        { name: "Hoàn thành", value: metricsData.completedOrders, fill: "#10b981" },
                        { name: "Đang xử lý", value: metricsData.pendingOrders, fill: "#f59e0b" },
                        { name: "Khác", value: Math.max(0, metricsData.totalOrders - metricsData.completedOrders - metricsData.pendingOrders), fill: "#6b7280" }
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, 'Đơn hàng']} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Chưa có dữ liệu đơn hàng
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detailed sales sections */}
          <ReportSalesDetails filteredOrders={salesOrders} monthlyData={monthlyData} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <Card className="border-blue-100 bg-blue-50/40">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg">Kết quả kinh doanh</CardTitle>
                  <CardDescription>
                    Doanh thu ghi nhận trước VAT theo ngày giao hàng. Đơn chưa giao và đơn hủy/hoàn không được tính.
                  </CardDescription>
                </div>
                <Select value={financialGranularity} onValueChange={(value) => setFinancialGranularity(value as FinancialGranularity)}>
                  <SelectTrigger className="w-full md:w-[170px] bg-white">
                    <SelectValue placeholder="Kỳ báo cáo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Theo ngày</SelectItem>
                    <SelectItem value="month">Theo tháng</SelectItem>
                    <SelectItem value="quarter">Theo quý</SelectItem>
                    <SelectItem value="year">Theo năm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-xs text-muted-foreground">Doanh thu trước VAT</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(metricsData.recognizedRevenue)}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-xs text-muted-foreground">Lợi nhuận gộp</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(metricsData.grossProfit)}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-xs text-muted-foreground">Lợi nhuận sau chi phí</p>
                  <p className={`mt-1 text-xl font-bold ${metricsData.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatCurrency(metricsData.netProfit)}
                  </p>
                </div>
              </div>

              {(financialPeriodData.some(row => row.estimatedCostOrders > 0 || row.missingCostOrders > 0) ||
                financialPeriodData.some(row => row.estimatedRevenueOrders > 0)) && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">Cần rà soát</Badge>
                  <span>
                    Một số số liệu đang dùng giá vốn hoặc doanh thu ước tính. Xem cột “Dữ liệu” để phân biệt trước khi chốt báo cáo.
                  </span>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <TableHead className="text-right">Doanh thu trước VAT</TableHead>
                      <TableHead className="text-right">Giá vốn</TableHead>
                      <TableHead className="text-right">LN gộp</TableHead>
                      <TableHead className="text-right">Chi phí</TableHead>
                      <TableHead className="text-right">LN sau chi phí</TableHead>
                      <TableHead className="text-right">Đơn giao</TableHead>
                      <TableHead>Dữ liệu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financialPeriodData.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Không có dữ liệu trong kỳ đã chọn</TableCell></TableRow>
                    ) : financialPeriodData.map(row => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-700">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right text-orange-700">{formatCurrency(row.costPrice)}</TableCell>
                        <TableCell className={`text-right font-semibold ${row.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(row.grossProfit)}</TableCell>
                        <TableCell className="text-right text-red-700">{formatCurrency(row.expenses)}</TableCell>
                        <TableCell className={`text-right font-semibold ${row.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(row.netProfit)}</TableCell>
                        <TableCell className="text-right">{row.orders}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.estimatedRevenueOrders > 0 && <Badge variant="outline" className="border-blue-200 text-blue-700">DT ước tính: {row.estimatedRevenueOrders}</Badge>}
                            {row.estimatedCostOrders > 0 && <Badge variant="outline" className="border-amber-200 text-amber-700">GV ước tính: {row.estimatedCostOrders}</Badge>}
                            {row.missingCostOrders > 0 && <Badge variant="destructive">Thiếu GV: {row.missingCostOrders}</Badge>}
                            {row.estimatedRevenueOrders === 0 && row.estimatedCostOrders === 0 && row.missingCostOrders === 0 && <span className="text-xs text-muted-foreground">Đủ dữ liệu</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng doanh thu</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(metricsData.recognizedRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  trước VAT, theo ngày giao
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Chi phí</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(metricsData.totalExpensesAmount)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận gộp</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(metricsData.grossProfit)}</div>
                <p className="text-xs text-muted-foreground">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.grossProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metricsData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metricsData.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.netProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Financial Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu vs Chi phí</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "Doanh thu", value: metricsData.totalOrderRevenue, fill: "#10b981" },
                      { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                      { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                       <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Phân bổ doanh thu ghi nhận</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                          { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" },
                          { name: "Lợi nhuận ròng", value: Math.max(0, metricsData.netProfit), fill: "#10b981" }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label
                      >
                        {[
                          { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                          { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" },
                          { name: "Lợi nhuận ròng", value: Math.max(0, metricsData.netProfit), fill: "#10b981" }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Tình trạng thanh toán</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{metricsData.paidOrders}</div>
                  <div className="text-sm text-green-700">Đã thanh toán</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{metricsData.partialPaidOrders}</div>
                  <div className="text-sm text-yellow-700">Thanh toán một phần</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{metricsData.unpaidOrders}</div>
                  <div className="text-sm text-red-700">Chưa thanh toán</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed financial sections */}
          <ReportFinancialDetails
            filteredOrders={salesOrders}
            filteredExpenses={filteredExpenses}
            orderPayments={allOrderPayments}
            filteredPayments={filteredPayments}
            monthlyData={monthlyData}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng khách hàng</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalCustomers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Khách hàng mới</CardTitle>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metricsData.newCustomers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Doanh thu/Khách hàng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(metricsData.totalCustomers > 0 ? metricsData.totalOrderRevenue / metricsData.totalCustomers : 0)}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tỷ lệ tăng trưởng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {metricsData.customerGrowth >= 0 ? "+" : ""}{Math.round(metricsData.customerGrowth)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>Khách hàng gần đây</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên khách hàng</TableHead>
                      <TableHead>Mã khách hàng</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Tổng đơn hàng</TableHead>
                      <TableHead>Tổng giá trị</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.slice(0, 10).map((customer) => {
                      const customerOrders = salesOrders.filter(o => o.customers?.id === customer.id);
                      const totalValue = customerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
                      
                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.customer_code}</TableCell>
                          <TableCell>{format(new Date(customer.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{customerOrders.length}</TableCell>
                          <TableCell>{formatCurrency(totalValue)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Detailed customer sections */}
          <ReportCustomerDetails
            filteredOrders={salesOrders}
            customers={customersInPeriod}
            formatCurrency={formatCurrency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;

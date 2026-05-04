import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuotes: number;
  totalProducts: number;
  pendingOrders: number;
  approvedQuotes: number;
  monthlyRevenue: number;
  monthlyOrders: number;
  monthlyCustomers: number;
}

export const useDashboardStats = () => {
  // Egress optimization: removed realtime (Dashboard doesn't need instant updates).
  // Stats refetch on mount + every 5 minutes is plenty.
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

      // Fetch all data in parallel
      const [
        ordersResponse,
        customersResponse,
        quotesResponse,
        productsResponse
      ] = await Promise.all([
        supabase.from('orders').select('total_amount, created_at, status'),
        supabase.from('customers').select('id, created_at'),
        supabase.from('quotes').select('total_amount, status, created_at'),
        supabase.from('products').select('id')
      ]);

      const orders = ordersResponse.data || [];
      const customers = customersResponse.data || [];
      const quotes = quotesResponse.data || [];
      const products = productsResponse.data || [];

      // Calculate stats
      const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      const totalOrders = orders.length;
      const totalCustomers = customers.length;
      const totalQuotes = quotes.length;
      const totalProducts = products.length;
      const pendingOrders = orders.filter(order => order.status === 'pending').length;
      const approvedQuotes = quotes.filter(quote => quote.status === 'approved').length;

      // Monthly stats
      const monthlyOrders = orders.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate >= startOfMonth && orderDate <= endOfMonth;
      });
      
      const monthlyRevenue = monthlyOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      
      const monthlyCustomers = customers.filter(customer => {
        const customerDate = new Date(customer.created_at);
        return customerDate >= startOfMonth && customerDate <= endOfMonth;
      }).length;

      return {
        totalRevenue,
        totalOrders,
        totalCustomers,
        totalQuotes,
        totalProducts,
        pendingOrders,
        approvedQuotes,
        monthlyRevenue,
        monthlyOrders: monthlyOrders.length,
        monthlyCustomers,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
  });
};
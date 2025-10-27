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
  const queryClient = useQueryClient();

  // Set up real-time synchronization
  useEffect(() => {
    console.log('🔧 Setting up dashboard real-time sync...');
    
    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    staleTime: 0, // Always fresh
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};
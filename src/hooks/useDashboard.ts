import { useQuery } from '@tanstack/react-query';
import { loadDashboardStats, type DashboardStats } from '@/lib/dashboard-stats';

export const useDashboardStats = () => {
  // Egress optimization: removed realtime (Dashboard doesn't need instant updates).
  // Stats refetch on mount + every 5 minutes is plenty.
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: (): Promise<DashboardStats> => loadDashboardStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
  });
};

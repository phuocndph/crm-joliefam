import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/hooks/useUserRole';

interface UserStats {
  totalUsers: number;
  adminCount: number;
  managerCount: number;
  employeeCount: number;
  recentUsers: number; // Users created in last 7 days
}

export const useUserStats = (currentUserRole: UserRole | null) => {
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    adminCount: 0,
    managerCount: 0,
    employeeCount: 0,
    recentUsers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!currentUserRole || currentUserRole === 'employee') {
        setLoading(false);
        return;
      }

      try {
        // Get all profiles with roles
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select(`
            id,
            created_at
          `);

        if (error) throw error;

        // Get all user roles separately
        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role');

        if (rolesError) throw rolesError;

        // Calculate stats
        const totalUsers = profiles?.length || 0;
        let adminCount = 0;
        let managerCount = 0;
        let employeeCount = 0;
        let recentUsers = 0;

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Count roles
        userRoles?.forEach(userRole => {
          switch (userRole.role) {
            case 'admin':
              adminCount++;
              break;
            case 'manager':
              managerCount++;
              break;
            case 'employee':
              employeeCount++;
              break;
          }
        });

        // Count recent users
        profiles?.forEach(profile => {
          if (new Date(profile.created_at) > oneWeekAgo) {
            recentUsers++;
          }
        });

        setStats({
          totalUsers,
          adminCount,
          managerCount,
          employeeCount,
          recentUsers
        });
      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentUserRole]);

  return { stats, loading };
};
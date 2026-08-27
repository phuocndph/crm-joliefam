import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export interface Manager {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
}

export const useManagers = () => {
  const queryClient = useQueryClient();
  console.log('useManagers hook called');
  
  // Set up real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('managers-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['managers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['managers'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['managers'],
    queryFn: async () => {
      console.log('useManagers - Starting query...');
      
      // First get users with manager role
      const { data: userRolesData, error: userRolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager');
      
      console.log('useManagers - userRolesData:', userRolesData);
      console.log('useManagers - userRolesError:', userRolesError);
      
      if (userRolesError) throw userRolesError;
      
      if (!userRolesData || userRolesData.length === 0) {
        return [];
      }

      // Get user profile information
      const userIds = userRolesData.map(role => role.user_id);
      console.log('useManagers - userIds:', userIds);
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, first_name, last_name')
        .in('user_id', userIds);
      
      console.log('useManagers - profilesData:', profilesData);
      console.log('useManagers - profilesError:', profilesError);
      
      if (profilesError) throw profilesError;
      
      const managers = (profilesData || []).map(profile => ({
        user_id: profile.user_id,
        email: profile.email || '',
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        display_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Không có tên'
      }));
      
      console.log('useManagers - final managers:', managers);
      return managers as Manager[];
    },
    staleTime: 60 * 1000, // Always fresh
    refetchOnMount: true,
  });
};
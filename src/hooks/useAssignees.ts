import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

export interface Assignee {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  manager_id?: string;
}

export const useAssignees = () => {
  const queryClient = useQueryClient();

  // Set up real-time synchronization with unique channel name
  useEffect(() => {
    if (isLocalBackend()) return;
    const channelName = `assignees-sync-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignees' }, (payload) => {
        console.log('👤 Assignees real-time update received:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['assignees'] });
      })
      .subscribe((status) => {
        console.log(`👤 ${channelName} subscription status:`, status);
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Assignees realtime subscription failed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['assignees'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.assignees() as unknown as Promise<Assignee[]>;
      const { data, error } = await supabase
        .from('assignees')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Assignee[];
    },
    staleTime: 60 * 1000, // Always fresh
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateAssignee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      if (isLocalBackend()) return localApi.createAssignee(data) as unknown as Promise<Assignee>;
      const { data: result, error } = await supabase
        .from('assignees')
        .insert([{ name: data.name }])
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignees'] });
    },
  });
};

export const useUpdateAssignee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (isLocalBackend()) return localApi.updateAssignee(id, { name }) as unknown as Promise<Assignee>;
      const { data, error } = await supabase
        .from('assignees')
        .update({ name })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignees'] });
    },
  });
};

export const useDeleteAssignee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLocalBackend()) { await localApi.deleteAssignee(id); return; }
      const { error } = await supabase
        .from('assignees')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignees'] });
    },
  });
};

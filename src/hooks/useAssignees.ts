import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Assignee {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  manager_id?: string;
}

export const useAssignees = () => {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignees')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Assignee[];
    },
  });
};

export const useCreateAssignee = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string }) => {
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
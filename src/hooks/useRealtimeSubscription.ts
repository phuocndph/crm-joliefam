import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface TableSubscription {
  table: string;
}

/**
 * Standardized hook for real-time Supabase subscriptions
 * Uses unique channel names to prevent conflicts across multiple browser tabs
 * 
 * @param tables - Array of table configurations to subscribe to
 * @param queryKeys - Array of query keys to invalidate when changes occur
 * @param channelPrefix - Prefix for the channel name (will have timestamp appended)
 */
export const useRealtimeSubscription = (
  tables: TableSubscription[],
  queryKeys: string[][],
  channelPrefix: string
) => {
  const queryClient = useQueryClient();
  // Use ref to store stable channel name across renders
  const channelNameRef = useRef(`${channelPrefix}-${Date.now()}`);
  
  // Memoize table names for dependency stability
  const tableNames = useMemo(() => tables.map(t => t.table).join(','), [tables]);
  const queryKeyStr = useMemo(() => JSON.stringify(queryKeys), [queryKeys]);

  useEffect(() => {
    const channelName = channelNameRef.current;
    let channel: RealtimeChannel = supabase.channel(channelName);

    // Egress optimization: subscribe only to INSERT/DELETE (UPDATE only invalidates cache,
    // we don't need full row payload — refetch will pull fresh data when needed)
    const handler = () => {
      queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
    };
    tables.forEach(({ table }) => {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, handler)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, handler);
    });

    channel.subscribe((status) => {
      console.log(`📡 ${channelPrefix} subscription status:`, status);
      if (status === 'CHANNEL_ERROR') {
        console.error(`❌ ${channelPrefix} subscription failed - tables may not be in realtime publication`);
      }
    });

    return () => {
      console.log(`📡 Cleaning up ${channelName} subscription`);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, channelPrefix, tableNames, queryKeyStr]);
};

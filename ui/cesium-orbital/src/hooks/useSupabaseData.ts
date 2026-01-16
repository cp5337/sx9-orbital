import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { GroundNode, Satellite, QKDMetric } from '@/types';

export function useSupabaseData<T>(tableName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: fetchedData, error: fetchError } = await supabase
          .from(tableName)
          .select('*');

        if (fetchError) throw fetchError;
        setData(fetchedData || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    const channel = supabase
      .channel(`${tableName}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName]);

  return { data, loading, error };
}

export function useGroundNodes() {
  const [nodes, setNodes] = useState<GroundNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchNodes() {
      try {
        const { data, error: fetchError } = await supabase
          .from('ground_nodes')
          .select('*')
          .order('name');

        if (fetchError) throw fetchError;
        setNodes(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchNodes();

    const channel = supabase
      .channel('ground_nodes_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ground_nodes' },
        () => {
          fetchNodes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { nodes, loading, error };
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSatellites() {
      try {
        const { data, error: fetchError } = await supabase
          .from('satellites')
          .select('*')
          .order('name');

        if (fetchError) throw fetchError;
        setSatellites(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchSatellites();

    const channel = supabase
      .channel('satellites_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'satellites' },
        () => {
          fetchSatellites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { satellites, loading, error };
}

export function useQKDMetrics(satelliteId?: string) {
  const [metrics, setMetrics] = useState<QKDMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        let query = supabase
          .from('qkd_metrics')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(100);

        if (satelliteId) {
          query = query.eq('satellite_id', satelliteId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setMetrics(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [satelliteId]);

  return { metrics, loading, error };
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface BeamTelemetry {
  id: string;
  beam_type: string;
  source_node_id: string;
  target_node_id: string;
  beam_status: string;
  link_quality_score: number;
  throughput_gbps: number;
  latency_ms: number;
  qber: number;
  optical_power_dbm: number;
  pointing_error_urad: number;
  atmospheric_attenuation_db: number;
  distance_km: number;
  elevation_deg: number;
  weather_score: number;
  radiation_flux_at_source: number;
  in_radiation_belt: boolean;
  updated_at: string;
}

export function useBeamTelemetry(filterStatus?: string) {
  const [beams, setBeams] = useState<BeamTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    let mounted = true;
    let realtimeChannel: RealtimeChannel | null = null;

    async function fetchInitialData() {
      try {
        let query = supabase.from('beams').select('*');

        if (filterStatus && filterStatus !== 'all') {
          query = query.eq('beam_status', filterStatus);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (mounted) {
          setBeams(data || []);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    }

    function setupRealtimeSubscription() {
      realtimeChannel = supabase
        .channel('beams-telemetry')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'beams',
          },
          (payload) => {
            if (!mounted) return;

            if (payload.eventType === 'INSERT') {
              const newBeam = payload.new as BeamTelemetry;
              if (!filterStatus || filterStatus === 'all' || newBeam.beam_status === filterStatus) {
                setBeams((prev) => [...prev, newBeam]);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedBeam = payload.new as BeamTelemetry;
              setBeams((prev) =>
                prev.map((beam) =>
                  beam.id === updatedBeam.id ? updatedBeam : beam
                )
              );
            } else if (payload.eventType === 'DELETE') {
              const deletedBeam = payload.old as BeamTelemetry;
              setBeams((prev) => prev.filter((beam) => beam.id !== deletedBeam.id));
            }
          }
        )
        .subscribe();

      setChannel(realtimeChannel);
    }

    fetchInitialData();
    setupRealtimeSubscription();

    return () => {
      mounted = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [filterStatus]);

  return { beams, loading, error, connected: channel?.state === 'joined' };
}

export function useBeamHandoffEvents() {
  const [handoffEvents, setHandoffEvents] = useState<any[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    let mounted = true;

    const realtimeChannel = supabase
      .channel('beam-handoffs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'beam_handoff_events',
        },
        (payload) => {
          if (!mounted) return;
          setHandoffEvents((prev) => [payload.new, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    setChannel(realtimeChannel);

    return () => {
      mounted = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  return { handoffEvents, connected: channel?.state === 'joined' };
}

export function useSingleBeamTelemetry(beamId: string | null) {
  const [beam, setBeam] = useState<BeamTelemetry | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!beamId) {
      setBeam(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    let realtimeChannel: RealtimeChannel | null = null;

    async function fetchBeam() {
      try {
        const { data, error: fetchError } = await supabase
          .from('beams')
          .select('*')
          .eq('id', beamId)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (mounted) {
          setBeam(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching beam:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    }

    function setupRealtimeSubscription() {
      realtimeChannel = supabase
        .channel(`beam-${beamId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'beams',
            filter: `id=eq.${beamId}`,
          },
          (payload) => {
            if (!mounted) return;
            const updatedBeam = payload.new as BeamTelemetry;
            setBeam(updatedBeam);
            setHistory((prev) => [...prev, updatedBeam.link_quality_score].slice(-60));
          }
        )
        .subscribe();

      setChannel(realtimeChannel);
    }

    fetchBeam();
    setupRealtimeSubscription();

    return () => {
      mounted = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [beamId]);

  return { beam, history, loading, connected: channel?.state === 'joined' };
}

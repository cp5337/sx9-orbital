// Beam Pattern Supabase Service
// Service: beamPatternService.ts | Lines: ~185 | Tier: Simple (<200)

import { supabase } from '@/lib/supabase';
import { DeclinationConfig, LinkBudgetResult } from '@/wasm/types';

export interface SavedBeamPattern {
  id: string;
  name: string;
  ground_node_id: string | null;
  beam_type: string;
  parameters: {
    wavelength_nm: number;
    waist_radius_mm: number;
    power_watts: number;
    cn2_turbulence: number;
  };
  thumbnail_url?: string;
  created_at: string;
}

export interface LinkPerformance {
  id: string;
  ground_node_id: string;
  elevation_deg: number;
  quality_score: number;
  atmospheric_transmission: number;
  link_budget_margin_db: number;
  weather_conditions: Record<string, any>;
  timestamp: string;
}

export class BeamPatternService {
  async getDeclinationConfig(groundNodeId: string): Promise<DeclinationConfig | null> {
    const { data, error } = await supabase
      .from('ground_station_declination_config')
      .select('*')
      .eq('ground_node_id', groundNodeId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch declination config:', error);
      throw error;
    }

    if (!data) return null;

    return {
      stationId: data.ground_node_id,
      preset: data.preset_type,
      angles: data.angles_deg,
      custom: data.is_custom,
    };
  }

  async saveDeclinationConfig(config: DeclinationConfig): Promise<void> {
    const { error } = await supabase
      .from('ground_station_declination_config')
      .upsert({
        ground_node_id: config.stationId,
        preset_type: config.preset,
        angles_deg: config.angles,
        is_custom: config.custom,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to save declination config:', error);
      throw error;
    }
  }

  async getDeclinationPresets() {
    const { data, error } = await supabase
      .from('declination_angle_presets')
      .select('*')
      .order('name');

    if (error) {
      console.error('Failed to fetch presets:', error);
      throw error;
    }

    return data || [];
  }

  async saveBeamPattern(pattern: Omit<SavedBeamPattern, 'id' | 'created_at'>): Promise<string> {
    const { data, error } = await supabase
      .from('beam_pattern_library')
      .insert({
        name: pattern.name,
        ground_node_id: pattern.ground_node_id,
        beam_type: pattern.beam_type,
        parameters: pattern.parameters,
        thumbnail_url: pattern.thumbnail_url,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save beam pattern:', error);
      throw error;
    }

    return data.id;
  }

  async getBeamPatterns(groundNodeId?: string): Promise<SavedBeamPattern[]> {
    let query = supabase
      .from('beam_pattern_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (groundNodeId) {
      query = query.eq('ground_node_id', groundNodeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch beam patterns:', error);
      throw error;
    }

    return data || [];
  }

  async deleteBeamPattern(patternId: string): Promise<void> {
    const { error } = await supabase
      .from('beam_pattern_library')
      .delete()
      .eq('id', patternId);

    if (error) {
      console.error('Failed to delete beam pattern:', error);
      throw error;
    }
  }

  async recordLinkPerformance(
    groundNodeId: string,
    budgets: LinkBudgetResult[],
    weatherConditions: Record<string, any> = {}
  ): Promise<void> {
    const records = budgets.map(budget => ({
      ground_node_id: groundNodeId,
      elevation_deg: budget.elevation_deg,
      quality_score: budget.transmission_factor,
      atmospheric_transmission: budget.transmission_factor,
      link_budget_margin_db: budget.total_margin_db,
      weather_conditions: weatherConditions,
      timestamp: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('station_link_performance')
      .insert(records);

    if (error) {
      console.error('Failed to record link performance:', error);
      throw error;
    }
  }

  async getLinkPerformanceHistory(
    groundNodeId: string,
    limit: number = 100
  ): Promise<LinkPerformance[]> {
    const { data, error } = await supabase
      .from('station_link_performance')
      .select('*')
      .eq('ground_node_id', groundNodeId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch link performance:', error);
      throw error;
    }

    return data || [];
  }

  async getLinkPerformanceByElevation(
    groundNodeId: string,
    elevationDeg: number,
    tolerance: number = 2.5
  ): Promise<LinkPerformance[]> {
    const { data, error } = await supabase
      .from('station_link_performance')
      .select('*')
      .eq('ground_node_id', groundNodeId)
      .gte('elevation_deg', elevationDeg - tolerance)
      .lte('elevation_deg', elevationDeg + tolerance)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch performance by elevation:', error);
      throw error;
    }

    return data || [];
  }
}

export const beamPatternService = new BeamPatternService();

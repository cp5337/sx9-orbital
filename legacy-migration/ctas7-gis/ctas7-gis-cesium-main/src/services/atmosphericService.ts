// Atmospheric Conditions Service
// Service: atmosphericService.ts | Lines: ~190 | Tier: Simple (<200)

import { supabase } from '@/lib/supabase';
import { AtmosphericConditions } from '@/wasm/types';

export interface WeatherData {
  ground_node_id: string;
  cloud_cover_percent: number;
  visibility_km: number;
  wind_speed_m_s: number;
  temperature_c: number;
  humidity_percent: number;
  pressure_hpa: number;
  timestamp: string;
}

export interface TurbulenceEstimate {
  cn2_turbulence: number;
  elevation_deg: number;
  seeing_arcsec: number;
  scintillation_index: number;
}

export class AtmosphericService {
  async getWeatherConditions(groundNodeId: string): Promise<WeatherData | null> {
    const { data, error } = await supabase
      .from('weather_data')
      .select('*')
      .eq('ground_node_id', groundNodeId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch weather:', error);
      return null;
    }

    return data;
  }

  calculateCn2Turbulence(
    cloudCover: number,
    windSpeed: number,
    elevationDeg: number
  ): number {
    const baselineCn2 = 1e-15;

    const cloudFactor = 1.0 + (cloudCover / 100.0) * 2.0;
    const windFactor = Math.max(0.5, Math.min(2.0, windSpeed / 10.0));

    const airMass = 1.0 / Math.sin((elevationDeg * Math.PI) / 180.0);
    const elevationFactor = Math.pow(airMass, 0.6);

    const cn2 = baselineCn2 * cloudFactor * windFactor * elevationFactor;

    return Math.max(1e-17, Math.min(1e-13, cn2));
  }

  calculateAtmosphericLoss(elevationDeg: number): number {
    const airMass = 1.0 / Math.sin((elevationDeg * Math.PI) / 180.0);
    const transmission = Math.exp(-0.15 * airMass);
    return -10.0 * Math.log10(transmission);
  }

  calculateTurbulencePenalty(
    elevationDeg: number,
    cn2: number
  ): number {
    const turbulenceFactor = elevationDeg < 30.0
      ? (30.0 - elevationDeg) / 30.0
      : 0.0;

    return turbulenceFactor * Math.abs(Math.log10(cn2)) * 0.5;
  }

  estimateLinkQuality(
    elevationDeg: number,
    weather: WeatherData | null
  ): number {
    const cn2 = weather
      ? this.calculateCn2Turbulence(
          weather.cloud_cover_percent,
          weather.wind_speed_m_s,
          elevationDeg
        )
      : 1e-15;

    const atmLoss = this.calculateAtmosphericLoss(elevationDeg);
    const turbPenalty = this.calculateTurbulencePenalty(elevationDeg, cn2);
    const totalLoss = atmLoss + turbPenalty;

    const cloudPenalty = weather ? (weather.cloud_cover_percent / 100.0) * 5.0 : 0;

    const qualityDb = -(totalLoss + cloudPenalty);
    const qualityLinear = Math.pow(10, qualityDb / 10.0);

    return Math.max(0.0, Math.min(1.0, qualityLinear));
  }

  toWasmConditions(weather: WeatherData | null): AtmosphericConditions {
    if (!weather) {
      return {
        cn2_turbulence: 1e-15,
        visibility_km: 20.0,
        cloud_cover_percent: 0.0,
        wind_speed_m_s: 10.0,
        humidity_percent: 50.0,
        temperature_c: 15.0,
      };
    }

    const cn2 = this.calculateCn2Turbulence(
      weather.cloud_cover_percent,
      weather.wind_speed_m_s,
      45.0
    );

    return {
      cn2_turbulence: cn2,
      visibility_km: weather.visibility_km,
      cloud_cover_percent: weather.cloud_cover_percent,
      wind_speed_m_s: weather.wind_speed_m_s,
      humidity_percent: weather.humidity_percent,
      temperature_c: weather.temperature_c,
    };
  }

  estimateTurbulence(
    elevationDeg: number,
    weather: WeatherData | null
  ): TurbulenceEstimate {
    const cn2 = weather
      ? this.calculateCn2Turbulence(
          weather.cloud_cover_percent,
          weather.wind_speed_m_s,
          elevationDeg
        )
      : 1e-15;

    const wavelength = 1550e-9;
    const k = (2 * Math.PI) / wavelength;
    const distance = 1000e3;
    const rytov = 1.23 * cn2 * Math.pow(k, 7 / 6) * Math.pow(distance, 11 / 6);

    const seeing = Math.pow(cn2 / 1e-15, 0.6) * 1.5;

    return {
      cn2_turbulence: cn2,
      elevation_deg: elevationDeg,
      seeing_arcsec: seeing,
      scintillation_index: Math.sqrt(rytov),
    };
  }

  getAtmosphericQualityCategory(cn2: number): string {
    if (cn2 < 1e-16) return 'Excellent';
    if (cn2 < 5e-16) return 'Good';
    if (cn2 < 1e-15) return 'Moderate';
    if (cn2 < 5e-15) return 'Poor';
    return 'Very Poor';
  }
}

export const atmosphericService = new AtmosphericService();

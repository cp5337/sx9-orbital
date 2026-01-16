// TypeScript type definitions for WASM integration
// Module: wasm/types.ts | Lines: ~60

export type BeamType = 'gaussian' | 'bessel' | 'airy' | 'lg';

export type DeclinationPreset = 'basic' | 'operational' | 'precision' | 'custom';

export interface DeclinationConfig {
  stationId: string;
  preset: DeclinationPreset;
  angles: number[];
  custom: boolean;
}

export interface LinkBudgetResult {
  elevation_deg: number;
  atmospheric_loss_db: number;
  turbulence_penalty_db: number;
  total_margin_db: number;
  transmission_factor: number;
}

export interface BeamParameters {
  wavelength_nm: number;
  waist_radius_mm: number;
  power_watts: number;
  m2_factor: number;
}

export interface AtmosphericConditions {
  cn2_turbulence: number;
  visibility_km: number;
  cloud_cover_percent: number;
  wind_speed_m_s: number;
  humidity_percent: number;
  temperature_c: number;
}

export interface StationInfo {
  position: {
    latitude_deg: number;
    longitude_deg: number;
    altitude_m: number;
  };
  declination_angles: {
    angles_deg: number[];
    preset_type: DeclinationPreset;
    custom: boolean;
  };
}

export const STANDARD_PRESETS = {
  basic: [10.0, 20.0, 45.0, 70.0, 90.0],
  operational: [5.0, 10.0, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0],
  precision: [5.0, 7.5, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 85.0, 90.0],
} as const;

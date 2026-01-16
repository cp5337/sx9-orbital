// TypeScript wrapper for WASM beam pattern engine
// Module: wasm/beamPatternEngine.ts | Lines: ~170 | Tier: Simple (<200)

type BeamType = 'gaussian' | 'bessel' | 'airy' | 'lg';
type PresetType = 'basic' | 'operational' | 'precision';

interface StationConfig {
  id: string;
  latitude: number;
  longitude: number;
  altitude: number;
  preset?: PresetType;
}

interface LinkBudget {
  elevation_deg: number;
  atmospheric_loss_db: number;
  turbulence_penalty_db: number;
  total_margin_db: number;
  transmission_factor: number;
}

export class BeamPatternEngine {
  private wasmModule: any = null;
  private ecsWorld: any = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // @ts-ignore - WASM module will be generated
      const wasm = await import('../../beam-patterns-wasm/pkg');
      this.wasmModule = wasm;
      this.ecsWorld = new wasm.ECSWorld();
      this.initialized = true;
      console.log('[WASM] Beam Pattern Engine initialized');
    } catch (error) {
      console.error('[WASM] Failed to initialize:', error);
      throw new Error('Failed to initialize WASM module');
    }
  }

  async addGroundStation(config: StationConfig): Promise<void> {
    this.ensureInitialized();

    await this.ecsWorld.add_ground_station(
      config.id,
      config.latitude,
      config.longitude,
      config.altitude,
      config.preset || 'operational'
    );
  }

  async setDeclinationAngles(stationId: string, angles: number[]): Promise<void> {
    this.ensureInitialized();
    await this.ecsWorld.set_declination_angles(stationId, angles);
  }

  async getStationInfo(stationId: string): Promise<any> {
    this.ensureInitialized();
    const json = await this.ecsWorld.get_station_info(stationId);
    return JSON.parse(json);
  }

  async calculateLinkBudgets(stationId: string): Promise<LinkBudget[]> {
    this.ensureInitialized();
    const json = await this.ecsWorld.calculate_link_budgets(stationId);
    return JSON.parse(json);
  }

  async updateAtmosphericConditions(
    stationId: string,
    cn2: number,
    visibilityKm: number,
    cloudCover: number
  ): Promise<void> {
    this.ensureInitialized();
    await this.ecsWorld.update_atmospheric_conditions(
      stationId,
      cn2,
      visibilityKm,
      cloudCover
    );
  }

  async generateBeamPattern(
    beamType: BeamType,
    wavelengthNm: number,
    waistRadiusMm: number,
    powerWatts: number,
    cn2Turbulence: number,
    width: number,
    height: number
  ): Promise<Uint8Array> {
    this.ensureInitialized();

    const pattern = await this.wasmModule.generate_beam_pattern(
      beamType,
      wavelengthNm,
      waistRadiusMm,
      powerWatts,
      cn2Turbulence,
      width,
      height
    );

    return new Uint8Array(pattern);
  }

  calculateLinkMargin(
    elevationDeg: number,
    cn2Turbulence: number,
    cloudCover: number
  ): number {
    this.ensureInitialized();
    return this.wasmModule.calculate_link_margin(
      elevationDeg,
      cn2Turbulence,
      cloudCover
    );
  }

  getStationCount(): number {
    if (!this.initialized || !this.ecsWorld) return 0;
    return this.ecsWorld.station_count();
  }

  async exportState(): Promise<any> {
    this.ensureInitialized();
    const json = await this.ecsWorld.export_state();
    return JSON.parse(json);
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.wasmModule || !this.ecsWorld) {
      throw new Error('WASM engine not initialized. Call initialize() first.');
    }
  }
}

export const beamEngine = new BeamPatternEngine();

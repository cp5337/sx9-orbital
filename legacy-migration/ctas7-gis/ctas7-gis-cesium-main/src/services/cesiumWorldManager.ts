import * as Cesium from 'cesium';

export type WorldType = 'production' | 'staging' | 'sandbox' | 'fusion';

export interface WorldConfig {
  layers: Record<string, boolean>;
  camera: {
    lon: number;
    lat: number;
    height: number;
  };
  timeScale: number;
}

export interface GroundStationData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  status?: 'online' | 'offline' | 'degraded' | 'operational';
  type?: string;
  tier?: number;
  demand_gbps?: number;
  weather_score?: number;
}

export interface SatelliteData {
  id: string;
  name: string;
  tle?: [string, string];
  norad_id?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  velocity?: number;
  inclination?: number;
  status?: string;
}

export interface NetworkLinkData {
  id: string;
  source_id: string;
  target_id: string;
  status: 'active' | 'degraded' | 'inactive';
}

export class CesiumWorldManager {
  private viewer: Cesium.Viewer;
  private dataSources: Map<WorldType, Cesium.CustomDataSource>;
  private currentWorld: WorldType = 'production';
  private worldConfigs: Record<WorldType, WorldConfig>;
  private eventBus: EventTarget;
  private entities: Map<string, Cesium.Entity> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.dataSources = new Map();
    this.eventBus = new EventTarget();

    const storedConfigs = localStorage.getItem('cesium-world-configs');
    this.worldConfigs = storedConfigs
      ? JSON.parse(storedConfigs)
      : this.getDefaultWorldConfigs();

    this.initializeDataSources();
    this.setupEventHandlers();
  }

  private getDefaultWorldConfigs(): Record<WorldType, WorldConfig> {
    return {
      production: {
        layers: {
          groundStations: true,
          satellites: true,
          activeLinks: true,
          orbits: false,
        },
        camera: { lon: 0, lat: 0, height: 20000000 },
        timeScale: 1.0,
      },
      staging: {
        layers: {
          groundStations: true,
          satellites: false,
          activeLinks: false,
          orbits: false,
        },
        camera: { lon: -100, lat: 40, height: 15000000 },
        timeScale: 10.0,
      },
      sandbox: {
        layers: {
          groundStations: true,
          satellites: true,
          activeLinks: true,
          orbits: true,
        },
        camera: { lon: -75, lat: 35, height: 12000000 },
        timeScale: 100.0,
      },
      fusion: {
        layers: {
          groundStations: true,
          satellites: true,
          activeLinks: true,
          orbits: false,
        },
        camera: { lon: 0, lat: 0, height: 25000000 },
        timeScale: 1.0,
      },
    };
  }

  private initializeDataSources() {
    const worlds: WorldType[] = ['production', 'staging', 'sandbox', 'fusion'];

    worlds.forEach((world) => {
      const dataSource = new Cesium.CustomDataSource(world);
      this.dataSources.set(world, dataSource);
      this.viewer.dataSources.add(dataSource);
      dataSource.show = world === this.currentWorld;
    });
  }

  private setupEventHandlers() {
    this.viewer.selectedEntityChanged.addEventListener((entity) => {
      if (entity) {
        this.eventBus.dispatchEvent(
          new CustomEvent('entity-selected', {
            detail: {
              id: entity.id,
              name: entity.name,
              type: entity.properties?.getValue(Cesium.JulianDate.now())?.type,
              world: entity.properties?.getValue(Cesium.JulianDate.now())?.world,
            },
          })
        );
      }
    });

    this.viewer.clock.onTick.addEventListener((clock) => {
      this.eventBus.dispatchEvent(
        new CustomEvent('time-update', {
          detail: {
            currentTime: clock.currentTime.toString(),
            multiplier: clock.multiplier,
          },
        })
      );
    });
  }

  switchWorld(world: WorldType) {
    this.saveCurrentWorldConfig();

    this.dataSources.forEach((dataSource, key) => {
      dataSource.show = key === world || world === 'fusion';
    });

    this.currentWorld = world;
    this.restoreWorldConfig(world);

    this.eventBus.dispatchEvent(
      new CustomEvent('world-changed', { detail: { world } })
    );
  }

  private saveCurrentWorldConfig() {
    const camera = this.viewer.camera;
    const cartographic = Cesium.Cartographic.fromCartesian(camera.positionWC);

    this.worldConfigs[this.currentWorld].camera = {
      lon: Cesium.Math.toDegrees(cartographic.longitude),
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
    };

    this.worldConfigs[this.currentWorld].timeScale = this.viewer.clock.multiplier;

    localStorage.setItem('cesium-world-configs', JSON.stringify(this.worldConfigs));
  }

  private restoreWorldConfig(world: WorldType) {
    const config = this.worldConfigs[world];

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        config.camera.lon,
        config.camera.lat,
        config.camera.height
      ),
      duration: 2.0,
    });

    this.viewer.clock.multiplier = config.timeScale;

    Object.entries(config.layers).forEach(([layerId, visible]) => {
      this.setLayerVisibility(layerId, visible);
    });
  }

  addGroundStation(world: WorldType, station: GroundStationData) {
    const dataSource = this.dataSources.get(world);
    if (!dataSource) return;

    const color = this.getStatusColor(station.status);

    const entity = dataSource.entities.add({
      id: `${world}-${station.id}`,
      name: station.name,
      position: Cesium.Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        station.altitude
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: station.name,
        font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -15),
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#14171c99'),
      },
      properties: {
        type: 'ground_station',
        world: world,
        status: station.status,
      },
    });

    this.entities.set(`${world}-${station.id}`, entity);
  }

  addSatellite(world: WorldType, satellite: SatelliteData) {
    const dataSource = this.dataSources.get(world);
    if (!dataSource) return;

    try {
      const entity = dataSource.entities.add({
        id: `${world}-${satellite.id}`,
        name: satellite.name,
        availability: new Cesium.TimeIntervalCollection([
          new Cesium.TimeInterval({
            start: this.viewer.clock.startTime,
            stop: this.viewer.clock.stopTime,
          }),
        ]),
        point: {
          pixelSize: 8,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: satellite.name,
          font: '11px sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -15),
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#14171c99'),
        },
        properties: new Cesium.PropertyBag({
          type: 'satellite',
          world: world,
          tle: satellite.tle,
        }),
      });

      this.entities.set(`${world}-${satellite.id}`, entity);
    } catch (error) {
      console.error(`Failed to add satellite ${satellite.name}:`, error);
    }
  }

  addNetworkLink(world: WorldType, link: NetworkLinkData) {
    const dataSource = this.dataSources.get(world);
    if (!dataSource) return;

    const sourceEntity = this.entities.get(`${world}-${link.source_id}`);
    const targetEntity = this.entities.get(`${world}-${link.target_id}`);

    if (!sourceEntity || !targetEntity) {
      console.warn(`Cannot create link: source or target entity not found`);
      return;
    }

    const color = link.status === 'active'
      ? Cesium.Color.CYAN.withAlpha(0.5)
      : link.status === 'degraded'
      ? Cesium.Color.ORANGE.withAlpha(0.3)
      : Cesium.Color.RED.withAlpha(0.2);

    const entity = dataSource.entities.add({
      id: `${world}-${link.id}`,
      name: `Link: ${link.source_id} → ${link.target_id}`,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const sourcePos = sourceEntity.position?.getValue(this.viewer.clock.currentTime);
          const targetPos = targetEntity.position?.getValue(this.viewer.clock.currentTime);
          return sourcePos && targetPos ? [sourcePos, targetPos] : [];
        }, false) as unknown as Cesium.PositionProperty,
        width: 2,
        material: color,
        arcType: Cesium.ArcType.NONE,
      },
      properties: {
        type: 'network_link',
        world: world,
        status: link.status,
      },
    });

    this.entities.set(`${world}-${link.id}`, entity);
  }

  setLayerVisibility(layerId: string, visible: boolean) {
    this.worldConfigs[this.currentWorld].layers[layerId] = visible;
    localStorage.setItem('cesium-world-configs', JSON.stringify(this.worldConfigs));

    this.entities.forEach((entity) => {
      const properties = entity.properties?.getValue(Cesium.JulianDate.now());
      if (!properties) return;

      const entityType = properties.type;

      if (layerId === 'groundStations' && entityType === 'ground_station') {
        entity.show = visible;
      } else if (layerId === 'satellites' && entityType === 'satellite') {
        entity.show = visible;
      } else if (layerId === 'activeLinks' && entityType === 'network_link') {
        entity.show = visible;
      } else if (layerId === 'orbits' && entityType === 'satellite') {
        if (entity.path) {
          (entity.path as any).show = visible;
        }
      }
    });
  }

  setLayerOpacity(layerId: string, opacity: number) {
    this.entities.forEach((entity) => {
      const properties = entity.properties?.getValue(Cesium.JulianDate.now());
      if (!properties) return;

      const entityType = properties.type;

      if (layerId === 'groundStations' && entityType === 'ground_station' && entity.point) {
        const currentColor = entity.point.color?.getValue(Cesium.JulianDate.now());
        if (currentColor) {
          entity.point.color = currentColor.withAlpha(opacity);
        }
      } else if (layerId === 'satellites' && entityType === 'satellite' && entity.point) {
        const currentColor = entity.point.color?.getValue(Cesium.JulianDate.now());
        if (currentColor) {
          entity.point.color = currentColor.withAlpha(opacity);
        }
      }
    });
  }

  clearWorld(world: WorldType) {
    const dataSource = this.dataSources.get(world);
    if (dataSource) {
      dataSource.entities.removeAll();
    }

    this.entities.forEach((_, key) => {
      if (key.startsWith(`${world}-`)) {
        this.entities.delete(key);
      }
    });
  }

  clearAllWorlds() {
    this.dataSources.forEach((dataSource) => {
      dataSource.entities.removeAll();
    });
    this.entities.clear();
  }

  getEventBus(): EventTarget {
    return this.eventBus;
  }

  getCurrentWorld(): WorldType {
    return this.currentWorld;
  }

  getWorldConfig(world: WorldType): WorldConfig {
    return this.worldConfigs[world];
  }

  private getStatusColor(status?: string): string {
    switch (status) {
      case 'online':
      case 'operational':
        return '#10b981';
      case 'degraded':
        return '#f59e0b';
      case 'offline':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  }

  destroy() {
    this.dataSources.forEach((dataSource) => {
      this.viewer.dataSources.remove(dataSource);
    });
    this.dataSources.clear();
    this.entities.clear();
  }
}

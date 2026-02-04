import * as Cesium from 'cesium';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:18700';
const POSITION_FETCH_INTERVAL = 5000;
const ASSIGNMENT_FETCH_INTERVAL = 10000;

interface GatewayPosition {
  id: string;
  norad_id: number;
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_km_s: number;
  timestamp: string;
}

interface SatelliteEntity {
  id: string;
  name: string;
  entity: Cesium.Entity;
  billboard: Cesium.Entity;
  spotBeam: Cesium.Entity;
  rotationAngle: number;
}

interface GroundStationEntity {
  id: string;
  entity: Cesium.Entity;
  latitude: number;
  longitude: number;
  altitude: number;
}

interface LaserLink {
  entity: Cesium.Entity;
  satelliteId: string;
  groundStationId: string;
}

export class OrbitalAnimationManager {
  private satellites: Map<string, SatelliteEntity> = new Map();
  private groundStations: Map<string, GroundStationEntity> = new Map();
  private laserLinks: Map<string, LaserLink> = new Map();
  private animationFrameId: number | null = null;
  private positionFetchTimer: number | null = null;
  private assignmentFetchTimer: number | null = null;
  private viewer: Cesium.Viewer;
  private onSatellitePositionUpdate?: (id: string, lat: number, lon: number, altKm: number) => void;
  private cachedPositions: Map<string, GatewayPosition> = new Map();
  private annAssignments: Map<string, string> = new Map();
  private gatewayUrl: string;

  constructor(
    viewer: Cesium.Viewer,
    onSatellitePositionUpdate?: (id: string, lat: number, lon: number, altKm: number) => void,
    gatewayUrl?: string
  ) {
    this.viewer = viewer;
    this.onSatellitePositionUpdate = onSatellitePositionUpdate;
    this.gatewayUrl = gatewayUrl || GATEWAY_URL;
  }

  addSatellite(
    id: string,
    name: string,
    latitude: number,
    longitude: number,
    altitude: number,
    _inclination: number
  ): void {
    const billboard = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude * 1000),
      billboard: {
        image: this.createSatelliteIcon(),
        scale: 0.8,
        rotation: new Cesium.CallbackProperty(() => {
          const sat = this.satellites.get(id);
          return sat ? sat.rotationAngle : 0;
        }, false),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
      },
      label: {
        text: name,
        font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -25),
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#14171c99'),
      },
      properties: new Cesium.PropertyBag({
        layerId: 'satellites',
        entityType: 'satellite',
        satId: id,
        name,
      }),
    });

    const spotBeam = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
      ellipse: {
        semiMinorAxis: 900000,
        semiMajorAxis: 900000,
        material: Cesium.Color.fromCssColorString('#00f0ff').withAlpha(0.0),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#00f0ff'),
        outlineWidth: 1,
      },
      properties: new Cesium.PropertyBag({
        layerId: 'satellites',
        entityType: 'satellite_beam',
        satId: id,
      }),
    });

    const entity = this.viewer.entities.add({
      position: new Cesium.CallbackPositionProperty(() => {
        const sat = this.satellites.get(id);
        if (!sat) return Cesium.Cartesian3.ZERO;
        return sat.billboard.position?.getValue(Cesium.JulianDate.now()) || Cesium.Cartesian3.ZERO;
      }, false),
      properties: new Cesium.PropertyBag({
        layerId: 'satellites',
        entityType: 'satellite',
        satId: id,
        name,
      }),
    });

    this.satellites.set(id, {
      id,
      name,
      entity,
      billboard,
      spotBeam,
      rotationAngle: 0,
    });
  }

  addGroundStation(
    id: string,
    latitude: number,
    longitude: number,
    altitude: number = 0
  ): void {
    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
      properties: new Cesium.PropertyBag({ layerId: 'groundStations' }),
    });

    this.groundStations.set(id, {
      id,
      entity,
      latitude,
      longitude,
      altitude,
    });
  }

  private useExternalPositions = false;
  private speedMultiplier = 1;
  private paused = false;

  /** Update satellite position from an external source (e.g. ConstellationStore polling) */
  updatePositionExternal(id: string, lat: number, lon: number, altKm: number): void {
    this.cachedPositions.set(id, {
      id,
      norad_id: 0,
      latitude: lat,
      longitude: lon,
      altitude_km: altKm,
      velocity_km_s: 0,
      timestamp: new Date().toISOString(),
    });
  }

  /** When driven by external store, skip internal fetch loops */
  setExternalPositionMode(enabled: boolean): void {
    this.useExternalPositions = enabled;
  }

  /** Scale visual animation speed (billboard rotation). 1 = real-time. */
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  /** Pause the animation loop (positions stop updating visually) */
  pause(): void {
    this.paused = true;
  }

  /** Resume the animation loop */
  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  startAnimation(): void {
    if (this.animationFrameId !== null) return;

    if (!this.useExternalPositions) {
      this.fetchPositions();
      this.fetchAssignments();

      this.positionFetchTimer = window.setInterval(
        () => this.fetchPositions(),
        POSITION_FETCH_INTERVAL
      );
      this.assignmentFetchTimer = window.setInterval(
        () => this.fetchAssignments(),
        ASSIGNMENT_FETCH_INTERVAL
      );
    } else {
      // Still fetch assignments for ANN beam targeting
      this.fetchAssignments();
      this.assignmentFetchTimer = window.setInterval(
        () => this.fetchAssignments(),
        ASSIGNMENT_FETCH_INTERVAL
      );
    }

    const animate = () => {
      if (!this.paused) {
        this.updateSatellitePositions();
        this.updateLaserLinks();
      }
      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.positionFetchTimer !== null) {
      clearInterval(this.positionFetchTimer);
      this.positionFetchTimer = null;
    }
    if (this.assignmentFetchTimer !== null) {
      clearInterval(this.assignmentFetchTimer);
      this.assignmentFetchTimer = null;
    }
  }

  private async fetchPositions(): Promise<void> {
    try {
      const response = await fetch(
        `${this.gatewayUrl}/api/v1/satellites/positions`
      );
      if (!response.ok) return;
      const data = await response.json();
      for (const pos of data.satellites) {
        this.cachedPositions.set(pos.id, pos);
      }
    } catch {
      // Gateway not running — positions stay at last known or initial
    }
  }

  private async fetchAssignments(): Promise<void> {
    try {
      const response = await fetch(
        `${this.gatewayUrl}/api/v1/ann/assignments`
      );
      if (!response.ok) return;
      const data = await response.json();
      this.annAssignments = new Map(Object.entries(data.assignments));
    } catch {
      // Gateway not running — keep existing assignments
    }
  }

  private updateSatellitePositions(): void {
    this.satellites.forEach((sat) => {
      const pos = this.cachedPositions.get(sat.id);
      if (!pos) return;

      if (!isFinite(pos.longitude) || !isFinite(pos.latitude) || !isFinite(pos.altitude_km)) {
        return;
      }
      if (Math.abs(pos.latitude) > 90 || Math.abs(pos.longitude) > 180) {
        return;
      }

      const position = Cesium.Cartesian3.fromDegrees(
        pos.longitude,
        pos.latitude,
        pos.altitude_km * 1000
      );

      sat.billboard.position = new Cesium.ConstantPositionProperty(position);
      this.onSatellitePositionUpdate?.(sat.id, pos.latitude, pos.longitude, pos.altitude_km);

      const rotationStep = 0.02 * Math.min(this.speedMultiplier, 100);
      sat.rotationAngle += rotationStep;
      if (sat.rotationAngle > Math.PI * 2) {
        sat.rotationAngle -= Math.PI * 2;
      }

      const beamPosition = Cesium.Cartesian3.fromDegrees(
        pos.longitude,
        pos.latitude,
        0
      );
      sat.spotBeam.position = new Cesium.ConstantPositionProperty(beamPosition);
    });
  }

  private updateLaserLinks(): void {
    // Remove links whose assignment changed
    this.laserLinks.forEach((link, linkId) => {
      const assignment = this.annAssignments.get(link.satelliteId);
      if (assignment !== link.groundStationId) {
        this.removeLaserLink(linkId);
      }
    });

    // Create/update links from ANN assignments
    this.annAssignments.forEach((stationId, satId) => {
      const sat = this.satellites.get(satId);
      const pos = this.cachedPositions.get(satId);
      if (!sat || !pos) return;

      const linkId = `${satId}-link`;
      this.createOrUpdateLaserLink(
        linkId,
        satId,
        stationId,
        pos.longitude,
        pos.latitude,
        pos.altitude_km
      );
      this.illuminateSpotBeam(satId, true);
    });

    // Dim beams for unassigned satellites
    this.satellites.forEach((sat) => {
      if (!this.annAssignments.has(sat.id)) {
        this.illuminateSpotBeam(sat.id, false);
      }
    });
  }

  private createOrUpdateLaserLink(
    linkId: string,
    satelliteId: string,
    groundStationId: string,
    satLon: number,
    satLat: number,
    satAlt: number
  ): void {
    const gs = this.groundStations.get(groundStationId);
    if (!gs) return;

    if (!isFinite(satLon) || !isFinite(satLat) || !isFinite(satAlt)) {
      return;
    }

    if (Math.abs(satLat) > 90 || Math.abs(satLon) > 180) {
      return;
    }

    const positions = [
      Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, gs.altitude),
      Cesium.Cartesian3.fromDegrees(satLon, satLat, satAlt * 1000),
    ];

    if (this.laserLinks.has(linkId)) {
      const link = this.laserLinks.get(linkId)!;
      link.entity.polyline!.positions = new Cesium.ConstantProperty(positions);
    } else {
      const entity = this.viewer.entities.add({
        polyline: {
          positions: positions,
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            taperPower: 0.5,
            color: Cesium.Color.CYAN,
          }),
        },
      });

      this.laserLinks.set(linkId, {
        entity,
        satelliteId,
        groundStationId,
      });
    }
  }

  private removeLaserLink(linkId: string): void {
    const link = this.laserLinks.get(linkId);
    if (link) {
      this.viewer.entities.remove(link.entity);
      this.laserLinks.delete(linkId);
    }
  }

  private illuminateSpotBeam(satelliteId: string, illuminate: boolean): void {
    const sat = this.satellites.get(satelliteId);
    if (!sat || !sat.spotBeam.ellipse) return;

    if (illuminate) {
      sat.spotBeam.ellipse.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#00f0ff').withAlpha(0.3));
      (sat.spotBeam.ellipse as any).fill = true;
    } else {
      sat.spotBeam.ellipse.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#00f0ff').withAlpha(0.0));
      (sat.spotBeam.ellipse as any).fill = false;
    }
  }

  private createSatelliteIcon(): string {
    const svg = `
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="6" fill="#00f0ff" opacity="0.9"/>
        <rect x="4" y="14" width="8" height="4" fill="#4a90e2" opacity="0.8"/>
        <rect x="20" y="14" width="8" height="4" fill="#4a90e2" opacity="0.8"/>
      </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  destroy(): void {
    this.stopAnimation();
    this.satellites.forEach((sat) => {
      this.viewer.entities.remove(sat.entity);
      this.viewer.entities.remove(sat.billboard);
      this.viewer.entities.remove(sat.spotBeam);
    });
    this.laserLinks.forEach((link) => {
      this.viewer.entities.remove(link.entity);
    });
    this.satellites.clear();
    this.groundStations.clear();
    this.laserLinks.clear();
  }
}

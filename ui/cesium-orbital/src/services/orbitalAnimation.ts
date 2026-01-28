import * as Cesium from 'cesium';
import {
  simplifiedSGP4Propagate,
  eciToGeodetic,
  calculateGMST,
  calculateLinkGeometry,
  OrbitalElements,
} from '@/utils/orbitalMechanics';

interface SatelliteEntity {
  id: string;
  name: string;
  entity: Cesium.Entity;
  billboard: Cesium.Entity;
  spotBeam: Cesium.Entity;
  orbitalElements: OrbitalElements;
  startTime: Date;
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
  private viewer: Cesium.Viewer;
  private onSatellitePositionUpdate?: (id: string, lat: number, lon: number, altKm: number) => void;

  constructor(
    viewer: Cesium.Viewer,
    onSatellitePositionUpdate?: (id: string, lat: number, lon: number, altKm: number) => void
  ) {
    this.viewer = viewer;
    this.onSatellitePositionUpdate = onSatellitePositionUpdate;
  }

  addSatellite(
    id: string,
    name: string,
    latitude: number,
    longitude: number,
    altitude: number,
    inclination: number
  ): void {
    const orbitalElements = this.createOrbitalElements(
      altitude,
      inclination,
      longitude,
      latitude
    );

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
      orbitalElements,
      startTime: new Date(),
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

  private createOrbitalElements(
    altitudeKm: number,
    inclinationDeg: number,
    longitudeDeg: number,
    latitudeDeg: number
  ): OrbitalElements {
    const earthRadius = 6371;
    const semiMajorAxis = earthRadius + altitudeKm;
    const meanMotion = Math.sqrt(398600.4418 / (semiMajorAxis ** 3)) * 60;

    return {
      meanMotion: meanMotion * (1440 / (2 * Math.PI)),
      eccentricity: 0.001,
      inclination: inclinationDeg * (Math.PI / 180),
      raan: longitudeDeg * (Math.PI / 180),
      argPerigee: 0,
      meanAnomaly: latitudeDeg * (Math.PI / 180),
      bstar: 0.00001,
      epoch: new Date(),
    };
  }

  startAnimation(): void {
    if (this.animationFrameId !== null) return;

    const animate = () => {
      this.updateSatellitePositions();
      this.updateLaserLinks();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private updateSatellitePositions(): void {
    const now = new Date();

    this.satellites.forEach((sat) => {
      const minutesSinceEpoch =
        (now.getTime() - sat.startTime.getTime()) / 60000;

      const eci = simplifiedSGP4Propagate(sat.orbitalElements, minutesSinceEpoch);
      const gmst = calculateGMST(now);
      const geodetic = eciToGeodetic(eci, gmst);

      if (!isFinite(geodetic.longitude) || !isFinite(geodetic.latitude) || !isFinite(geodetic.altitude)) {
        console.warn(`Invalid geodetic coordinates for satellite ${sat.id}:`, geodetic);
        return;
      }

      if (Math.abs(geodetic.latitude) > 90 || Math.abs(geodetic.longitude) > 180) {
        console.warn(`Out of bounds coordinates for satellite ${sat.id}:`, geodetic);
        return;
      }

      const position = Cesium.Cartesian3.fromDegrees(
        geodetic.longitude,
        geodetic.latitude,
        geodetic.altitude * 1000
      );

      sat.billboard.position = new Cesium.ConstantPositionProperty(position);
      this.onSatellitePositionUpdate?.(sat.id, geodetic.latitude, geodetic.longitude, geodetic.altitude);

      sat.rotationAngle += 0.02;
      if (sat.rotationAngle > Math.PI * 2) {
        sat.rotationAngle -= Math.PI * 2;
      }

      const beamPosition = Cesium.Cartesian3.fromDegrees(
        geodetic.longitude,
        geodetic.latitude,
        0
      );
      sat.spotBeam.position = new Cesium.ConstantPositionProperty(beamPosition);
    });
  }

  private updateLaserLinks(): void {
    const now = new Date();
    const gmst = calculateGMST(now);

    this.satellites.forEach((sat) => {
      const minutesSinceEpoch = (now.getTime() - sat.startTime.getTime()) / 60000;
      const eci = simplifiedSGP4Propagate(sat.orbitalElements, minutesSinceEpoch);
      const geodetic = eciToGeodetic(eci, gmst);

      let bestGroundStationId = '';
      let bestElevation = 0;

      this.groundStations.forEach((gs) => {
        const linkGeometry = calculateLinkGeometry(
          eci,
          { latitude: gs.latitude, longitude: gs.longitude, altitude: gs.altitude },
          gmst
        );

        if (linkGeometry.visible && linkGeometry.elevation > 20 && linkGeometry.elevation > bestElevation) {
          bestGroundStationId = gs.id;
          bestElevation = linkGeometry.elevation;
        }
      });

      const linkId = `${sat.id}-link`;

      if (bestGroundStationId) {
        this.createOrUpdateLaserLink(
          linkId,
          sat.id,
          bestGroundStationId,
          geodetic.longitude,
          geodetic.latitude,
          geodetic.altitude
        );
        this.illuminateSpotBeam(sat.id, true);
      } else {
        this.removeLaserLink(linkId);
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
      console.warn(`Invalid satellite coordinates for laser link:`, { satLon, satLat, satAlt });
      return;
    }

    if (Math.abs(satLat) > 90 || Math.abs(satLon) > 180) {
      console.warn(`Out of bounds satellite coordinates for laser link:`, { satLon, satLat });
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

/**
 * FSO Laser Beam Renderer for Cesium
 *
 * Renders free-space optical links between:
 * - Satellite to satellite (inter-satellite links)
 * - Satellite to ground station (uplink/downlink)
 */

import * as Cesium from 'cesium';

export interface FsoLinkConfig {
  id: string;
  type: 'sat-sat' | 'sat-ground';
  sourceId: string;
  targetId: string;
  linkMargin: number; // dB - determines color/quality
  wavelength: number; // nm (typically 1550)
  active: boolean;
}

// Link quality color based on margin
export function getLinkColor(marginDb: number): Cesium.Color {
  if (marginDb >= 6) return Cesium.Color.fromCssColorString('#22c55e'); // Green - strong
  if (marginDb >= 3) return Cesium.Color.fromCssColorString('#eab308'); // Yellow - marginal
  if (marginDb >= 0) return Cesium.Color.fromCssColorString('#f97316'); // Orange - weak
  return Cesium.Color.fromCssColorString('#ef4444'); // Red - failing
}

// Create glow material for laser beam effect
function createLaserMaterial(color: Cesium.Color, glowPower: number = 0.25): Cesium.PolylineGlowMaterialProperty {
  return new Cesium.PolylineGlowMaterialProperty({
    glowPower,
    color,
  });
}

/**
 * FSO Beam Manager - handles creation and updates of laser links
 */
export class FsoBeamManager {
  private viewer: Cesium.Viewer;
  private satSatLinks: Map<string, Cesium.Entity> = new Map();
  private satGroundLinks: Map<string, Cesium.Entity> = new Map();
  private satPositions: Map<string, Cesium.Cartesian3> = new Map();
  private groundPositions: Map<string, Cesium.Cartesian3> = new Map();
  private scratchNormal = new Cesium.Cartesian3();
  private scratchVector = new Cesium.Cartesian3();
  private scratchVector2 = new Cesium.Cartesian3();
  private scratchVector3 = new Cesium.Cartesian3();
  private earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  /**
   * Register a satellite position for link calculation
   */
  setSatellitePosition(satId: string, lat: number, lon: number, altKm: number) {
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, altKm * 1000);
    this.satPositions.set(satId, position);
  }

  /**
   * Register a ground station position
   */
  setGroundStationPosition(gsId: string, lat: number, lon: number, altM: number = 0) {
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
    this.groundPositions.set(gsId, position);
  }

  /**
   * Add a satellite-to-satellite FSO link
   */
  addSatToSatLink(linkId: string, sat1Id: string, sat2Id: string, marginDb: number = 6): Cesium.Entity | null {
    const color = getLinkColor(marginDb);
    const material = createLaserMaterial(color);
    const entity = this.viewer.entities.add({
      id: `fso-sat-sat-${linkId}`,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const pos1 = this.satPositions.get(sat1Id);
          const pos2 = this.satPositions.get(sat2Id);
          if (!pos1 || !pos2) return [];
          return [pos1, pos2];
        }, false),
        width: 2,
        material,
        depthFailMaterial: material,
        arcType: Cesium.ArcType.NONE, // Straight line in 3D space
        show: new Cesium.CallbackProperty(() => {
          const pos1 = this.satPositions.get(sat1Id);
          const pos2 = this.satPositions.get(sat2Id);
          if (!pos1 || !pos2) return false;
          return this.hasLineOfSight(pos1, pos2);
        }, false),
      },
      description: `<strong>Inter-Satellite Link</strong><br/>
        ${sat1Id} ↔ ${sat2Id}<br/>
        Margin: ${marginDb.toFixed(1)} dB<br/>
        Wavelength: 1550 nm`,
      properties: new Cesium.PropertyBag({
        layerId: 'fsoSatSat',
        entityType: 'link',
        linkType: 'sat-sat',
        linkId,
        sourceId: sat1Id,
        targetId: sat2Id,
        marginDb,
      }),
    });

    this.satSatLinks.set(linkId, entity);
    return entity;
  }

  /**
   * Add a satellite-to-ground FSO link
   */
  addSatToGroundLink(linkId: string, satId: string, gsId: string, marginDb: number = 6): Cesium.Entity | null {
    const color = getLinkColor(marginDb);
    const material = createLaserMaterial(color, 0.35);
    const entity = this.viewer.entities.add({
      id: `fso-sat-ground-${linkId}`,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const satPos = this.satPositions.get(satId);
          const gsPos = this.groundPositions.get(gsId);
          if (!satPos || !gsPos) return [];
          return [satPos, gsPos];
        }, false),
        width: 3,
        material,
        depthFailMaterial: material,
        arcType: Cesium.ArcType.NONE,
        show: new Cesium.CallbackProperty(() => {
          const satPos = this.satPositions.get(satId);
          const gsPos = this.groundPositions.get(gsId);
          if (!satPos || !gsPos) return false;
          const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(gsPos, this.scratchNormal);
          const toSat = Cesium.Cartesian3.subtract(satPos, gsPos, this.scratchVector);
          return Cesium.Cartesian3.dot(normal, toSat) > 0;
        }, false),
      },
      description: `<strong>Ground Link</strong><br/>
        Satellite: ${satId}<br/>
        Ground Station: ${gsId}<br/>
        Margin: ${marginDb.toFixed(1)} dB`,
      properties: new Cesium.PropertyBag({
        layerId: 'fsoSatGround',
        entityType: 'link',
        linkType: 'sat-ground',
        linkId,
        sourceId: satId,
        targetId: gsId,
        marginDb,
      }),
    });

    this.satGroundLinks.set(linkId, entity);
    return entity;
  }

  /**
   * Update link visibility
   */
  setSatSatLinksVisible(visible: boolean) {
    this.satSatLinks.forEach((entity) => {
      entity.show = visible;
    });
  }

  setSatGroundLinksVisible(visible: boolean) {
    this.satGroundLinks.forEach((entity) => {
      entity.show = visible;
    });
  }

  setLinkVisibility(linkId: string, type: 'sat-sat' | 'sat-ground', visible: boolean) {
    const links = type === 'sat-sat' ? this.satSatLinks : this.satGroundLinks;
    const entity = links.get(linkId);
    if (entity) {
      entity.show = visible;
    }
  }

  private hasLineOfSight(pos1: Cesium.Cartesian3, pos2: Cesium.Cartesian3): boolean {
    const ab = Cesium.Cartesian3.subtract(pos2, pos1, this.scratchVector2);
    const abLenSq = Cesium.Cartesian3.magnitudeSquared(ab);
    if (abLenSq === 0) return false;
    const t = -Cesium.Cartesian3.dot(pos1, ab) / abLenSq;
    const clampedT = Math.min(1, Math.max(0, t));
    const closest = Cesium.Cartesian3.add(
      pos1,
      Cesium.Cartesian3.multiplyByScalar(ab, clampedT, this.scratchVector3),
      this.scratchVector3
    );
    return Cesium.Cartesian3.magnitude(closest) > this.earthRadius;
  }

  upsertLink(config: FsoLinkConfig) {
    const links = config.type === 'sat-sat' ? this.satSatLinks : this.satGroundLinks;
    if (!links.has(config.id)) {
      if (config.type === 'sat-sat') {
        this.addSatToSatLink(config.id, config.sourceId, config.targetId, config.linkMargin);
      } else {
        this.addSatToGroundLink(config.id, config.sourceId, config.targetId, config.linkMargin);
      }
    } else {
      this.updateLinkQuality(config.id, config.linkMargin, config.type);
    }
    if (typeof config.active === 'boolean') {
      this.setLinkVisibility(config.id, config.type, config.active);
    }
  }

  /**
   * Update a link's quality (color)
   */
  updateLinkQuality(linkId: string, marginDb: number, type: 'sat-sat' | 'sat-ground') {
    const links = type === 'sat-sat' ? this.satSatLinks : this.satGroundLinks;
    const entity = links.get(linkId);

    if (entity && entity.polyline) {
      const color = getLinkColor(marginDb);
      entity.polyline.material = createLaserMaterial(color) as unknown as Cesium.MaterialProperty;
    }
  }

  /**
   * Remove all links
   */
  clearAllLinks() {
    this.satSatLinks.forEach((entity) => {
      this.viewer.entities.remove(entity);
    });
    this.satGroundLinks.forEach((entity) => {
      this.viewer.entities.remove(entity);
    });
    this.satSatLinks.clear();
    this.satGroundLinks.clear();
  }

  /**
   * Destroy the manager
   */
  destroy() {
    this.clearAllLinks();
    this.satPositions.clear();
    this.groundPositions.clear();
  }

  /**
   * Get current link counts
   */
  getLinkCounts() {
    return {
      satToSat: this.satSatLinks.size,
      satToGround: this.satGroundLinks.size,
    };
  }
}

/**
 * Create demo FSO links for Walker Delta constellation
 * Connects adjacent satellites in same orbital plane
 */
export function createWalkerDeltaLinks(
  manager: FsoBeamManager,
  satellites: Array<{ id: string; planeIndex?: number }>
): void {
  // Group satellites by orbital plane (assuming naming convention includes plane)
  const planes: Map<number, string[]> = new Map();

  satellites.forEach((sat, idx) => {
    const planeIndex = sat.planeIndex ?? Math.floor(idx / 4); // Default: 4 sats per plane
    if (!planes.has(planeIndex)) {
      planes.set(planeIndex, []);
    }
    planes.get(planeIndex)!.push(sat.id);
  });

  // Create intra-plane links (adjacent satellites in same plane)
  planes.forEach((satsInPlane, planeIdx) => {
    for (let i = 0; i < satsInPlane.length; i++) {
      const nextIdx = (i + 1) % satsInPlane.length;
      const linkId = `plane${planeIdx}-${i}-${nextIdx}`;
      const margin = 8 + Math.random() * 4; // 8-12 dB margin
      manager.addSatToSatLink(linkId, satsInPlane[i], satsInPlane[nextIdx], margin);
    }
  });

  // Create inter-plane links (connect adjacent planes)
  const planeIndices = Array.from(planes.keys()).sort((a, b) => a - b);
  for (let i = 0; i < planeIndices.length - 1; i++) {
    const plane1 = planes.get(planeIndices[i])!;
    const plane2 = planes.get(planeIndices[i + 1])!;

    // Connect first satellite of each adjacent plane
    if (plane1.length > 0 && plane2.length > 0) {
      const linkId = `interplane-${planeIndices[i]}-${planeIndices[i + 1]}`;
      const margin = 5 + Math.random() * 3; // 5-8 dB margin (inter-plane is longer)
      manager.addSatToSatLink(linkId, plane1[0], plane2[0], margin);
    }
  }
}

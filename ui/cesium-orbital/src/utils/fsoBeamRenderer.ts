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
    const pos1 = this.satPositions.get(sat1Id);
    const pos2 = this.satPositions.get(sat2Id);

    if (!pos1 || !pos2) {
      console.warn(`Cannot create sat-sat link: missing position for ${sat1Id} or ${sat2Id}`);
      return null;
    }

    const color = getLinkColor(marginDb);
    const entity = this.viewer.entities.add({
      id: `fso-sat-sat-${linkId}`,
      polyline: {
        positions: [pos1, pos2],
        width: 2,
        material: createLaserMaterial(color),
        arcType: Cesium.ArcType.NONE, // Straight line in 3D space
      },
      description: `<strong>Inter-Satellite Link</strong><br/>
        ${sat1Id} ↔ ${sat2Id}<br/>
        Margin: ${marginDb.toFixed(1)} dB<br/>
        Wavelength: 1550 nm`,
    });

    this.satSatLinks.set(linkId, entity);
    return entity;
  }

  /**
   * Add a satellite-to-ground FSO link
   */
  addSatToGroundLink(linkId: string, satId: string, gsId: string, marginDb: number = 6): Cesium.Entity | null {
    const satPos = this.satPositions.get(satId);
    const gsPos = this.groundPositions.get(gsId);

    if (!satPos || !gsPos) {
      console.warn(`Cannot create sat-ground link: missing position for ${satId} or ${gsId}`);
      return null;
    }

    const color = getLinkColor(marginDb);
    const entity = this.viewer.entities.add({
      id: `fso-sat-ground-${linkId}`,
      polyline: {
        positions: [satPos, gsPos],
        width: 3,
        material: createLaserMaterial(color, 0.35),
        arcType: Cesium.ArcType.NONE,
      },
      description: `<strong>Ground Link</strong><br/>
        Satellite: ${satId}<br/>
        Ground Station: ${gsId}<br/>
        Margin: ${marginDb.toFixed(1)} dB`,
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

import * as Cesium from 'cesium';

export interface OrbitalZoneConfig {
  name: string;
  shortName: string;
  altitudeRangeKm: { min: number; max: number };
  color: string;
  opacity: number;
  description: string;
  labelColor: string;
}

export const ORBITAL_ZONES: OrbitalZoneConfig[] = [
  {
    name: 'Low Earth Orbit',
    shortName: 'LEO',
    altitudeRangeKm: { min: 160, max: 2000 },
    color: '#06b6d4',
    opacity: 0.15,
    description: 'Fast orbital periods, high data rates',
    labelColor: '#22d3ee',
  },
  {
    name: 'Medium Earth Orbit',
    shortName: 'MEO',
    altitudeRangeKm: { min: 2000, max: 35786 },
    color: '#3b82f6',
    opacity: 0.12,
    description: 'GPS and navigation satellites',
    labelColor: '#60a5fa',
  },
  {
    name: 'Geostationary Orbit',
    shortName: 'GEO',
    altitudeRangeKm: { min: 35786, max: 35786 },
    color: '#8b5cf6',
    opacity: 0.18,
    description: 'Fixed position relative to Earth',
    labelColor: '#a78bfa',
  },
];

const EARTH_RADIUS_KM = 6371;

export function addOrbitalZonesToViewer(viewer: Cesium.Viewer): void {
  ORBITAL_ZONES.forEach((zone) => {
    addOrbitalZone(viewer, zone);
    addZoneLabels(viewer, zone);
  });
}

function addOrbitalZone(viewer: Cesium.Viewer, config: OrbitalZoneConfig): void {
  const earthRadiusMeters = EARTH_RADIUS_KM * 1000;
  const minRadius = earthRadiusMeters + config.altitudeRangeKm.min * 1000;
  const maxRadius = earthRadiusMeters + config.altitudeRangeKm.max * 1000;

  if (config.shortName === 'GEO') {
    viewer.entities.add({
      name: `${config.name} Shell`,
      position: Cesium.Cartesian3.ZERO,
      ellipsoid: {
        radii: new Cesium.Cartesian3(maxRadius, maxRadius, maxRadius),
        innerRadii: new Cesium.Cartesian3(maxRadius - 50000, maxRadius - 50000, maxRadius - 50000),
        material: Cesium.Color.fromCssColorString(config.color).withAlpha(config.opacity),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(config.color).withAlpha(0.4),
        outlineWidth: 2,
      },
    });
  } else {
    const midRadius = (minRadius + maxRadius) / 2;

    viewer.entities.add({
      name: `${config.name} Zone`,
      position: Cesium.Cartesian3.ZERO,
      ellipsoid: {
        radii: new Cesium.Cartesian3(midRadius, midRadius, midRadius * 0.95),
        innerRadii: new Cesium.Cartesian3(
          minRadius,
          minRadius,
          minRadius * 0.95
        ),
        material: Cesium.Color.fromCssColorString(config.color).withAlpha(config.opacity),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(config.color).withAlpha(0.3),
        outlineWidth: 1,
      },
    });
  }
}

function addZoneLabels(viewer: Cesium.Viewer, config: OrbitalZoneConfig): void {
  const avgAltitude = (config.altitudeRangeKm.min + config.altitudeRangeKm.max) / 2;

  const labelPositions = [
    { lon: 0, lat: 30 },
    { lon: 120, lat: 30 },
    { lon: 240, lat: 30 },
  ];

  labelPositions.forEach((pos, index) => {
    const height = config.shortName === 'GEO' ? config.altitudeRangeKm.min * 1000 : avgAltitude * 1000;

    const labelPosition = Cesium.Cartesian3.fromDegrees(
      pos.lon,
      pos.lat,
      height
    );

    const labelText = index === 0
      ? `${config.shortName}\n${config.altitudeRangeKm.min.toLocaleString()}-${config.altitudeRangeKm.max.toLocaleString()} km\n${config.description}`
      : config.shortName;

    viewer.entities.add({
      position: labelPosition,
      label: {
        text: labelText,
        font: index === 0 ? 'bold 16px sans-serif' : 'bold 14px sans-serif',
        fillColor: Cesium.Color.fromCssColorString(config.labelColor),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0a0c10dd'),
        backgroundPadding: new Cesium.Cartesian2(10, 8),
        pixelOffset: new Cesium.Cartesian2(0, 0),
        style: Cesium.LabelStyle.FILL,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 3e7, 0.3),
      },
      point: index === 0 ? {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString(config.labelColor),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      } : undefined,
    });
  });

  if (config.shortName !== 'GEO') {
    addBoundaryMarkers(viewer, config);
  }
}

function addBoundaryMarkers(viewer: Cesium.Viewer, config: OrbitalZoneConfig): void {
  const boundaries = [
    { altitude: config.altitudeRangeKm.min, label: `${config.shortName} Lower` },
    { altitude: config.altitudeRangeKm.max, label: `${config.shortName} Upper` },
  ];

  boundaries.forEach((boundary) => {
    const positions = [
      { lon: 90, lat: 0 },
      { lon: 270, lat: 0 },
    ];

    positions.forEach((pos) => {
      const position = Cesium.Cartesian3.fromDegrees(
        pos.lon,
        pos.lat,
        boundary.altitude * 1000
      );

      viewer.entities.add({
        position: position,
        point: {
          pixelSize: 5,
          color: Cesium.Color.fromCssColorString(config.color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1.5,
        },
        label: {
          text: `${boundary.altitude.toLocaleString()} km`,
          font: '10px monospace',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#00000099'),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
          pixelOffset: new Cesium.Cartesian2(0, -12),
          scale: 0.9,
          scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 3e7, 0.0),
        },
      });
    });
  });
}

export function getZoneForAltitude(altitudeKm: number): OrbitalZoneConfig | null {
  for (const zone of ORBITAL_ZONES) {
    if (altitudeKm >= zone.altitudeRangeKm.min && altitudeKm <= zone.altitudeRangeKm.max) {
      return zone;
    }
  }
  return null;
}

export function createOrbitPath(
  viewer: Cesium.Viewer,
  satelliteId: string,
  altitudeKm: number,
  inclinationDeg: number,
  color: string = '#00f0ff'
): Cesium.Entity {
  const earthRadiusMeters = EARTH_RADIUS_KM * 1000;
  const orbitRadius = earthRadiusMeters + altitudeKm * 1000;
  const inclinationRad = inclinationDeg * (Math.PI / 180);

  const numPoints = 120;
  const positions: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;

    const x = orbitRadius * Math.cos(angle);
    const y = orbitRadius * Math.sin(angle) * Math.cos(inclinationRad);
    const z = orbitRadius * Math.sin(angle) * Math.sin(inclinationRad);

    positions.push(new Cesium.Cartesian3(x, y, z));
  }

  return viewer.entities.add({
    name: `${satelliteId}-orbit-path`,
    polyline: {
      positions: positions,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString(color).withAlpha(0.4),
        dashLength: 16,
      }),
    },
  });
}

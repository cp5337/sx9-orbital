// Radiation Belt Cesium Renderer with Intuitive Labels
// Util: radiationBeltRenderer.ts | Lines: ~195 | Tier: Simple (<200)

import * as Cesium from 'cesium';

export interface RadiationBeltConfig {
  name: string;
  type: 'inner' | 'outer';
  innerRadiusKm: number;
  outerRadiusKm: number;
  peakFluxProtons: number;
  color: string;
  opacity: number;
}

export const RADIATION_BELTS: RadiationBeltConfig[] = [
  {
    name: 'Inner Van Allen Belt',
    type: 'inner',
    innerRadiusKm: 7378,
    outerRadiusKm: 13000,
    peakFluxProtons: 1e9,
    color: '#ff6b6b',
    opacity: 0.25,
  },
  {
    name: 'Outer Van Allen Belt',
    type: 'outer',
    innerRadiusKm: 19000,
    outerRadiusKm: 65000,
    peakFluxProtons: 1e7,
    color: '#4ecdc4',
    opacity: 0.2,
  },
];

export function addRadiationBeltsToViewer(viewer: Cesium.Viewer): void {
  RADIATION_BELTS.forEach((belt) => {
    addRadiationBelt(viewer, belt);
    addBeltLabel(viewer, belt);
  });
}

function addRadiationBelt(
  viewer: Cesium.Viewer,
  config: RadiationBeltConfig
): void {
  const innerRadius = config.innerRadiusKm;
  const outerRadius = config.outerRadiusKm;

  viewer.entities.add({
    name: config.name,
    position: Cesium.Cartesian3.ZERO,
    ellipsoid: {
      radii: new Cesium.Cartesian3(
        outerRadius * 1000,
        outerRadius * 1000,
        (outerRadius - innerRadius) * 500
      ),
      innerRadii: new Cesium.Cartesian3(
        innerRadius * 1000,
        innerRadius * 1000,
        (outerRadius - innerRadius) * 500
      ),
      material: Cesium.Color.fromCssColorString(config.color).withAlpha(
        config.opacity
      ),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(config.color).withAlpha(
        config.opacity * 2
      ),
      outlineWidth: 2,
    },
    description: generateBeltDescription(config),
  });
}

function addBeltLabel(
  viewer: Cesium.Viewer,
  config: RadiationBeltConfig
): void {
  const midRadius = (config.innerRadiusKm + config.outerRadiusKm) / 2;

  const labelPosition = Cesium.Cartesian3.fromDegrees(
    45,
    0,
    midRadius * 1000
  );

  viewer.entities.add({
    position: labelPosition,
    label: {
      text: `${config.name}\n${formatFlux(config.peakFluxProtons)} p/cm²/s\n${config.innerRadiusKm.toFixed(0)}-${config.outerRadiusKm.toFixed(0)} km`,
      font: 'bold 14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#000000cc'),
      backgroundPadding: new Cesium.Cartesian2(8, 6),
      pixelOffset: new Cesium.Cartesian2(0, 0),
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineWidth: 2,
      outlineColor: Cesium.Color.fromCssColorString(config.color),
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -10000),
    },
    billboard: {
      image: createWarningIconDataURL(),
      scale: 0.4,
      pixelOffset: new Cesium.Cartesian2(-20, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  addRadiusMarkers(viewer, config);
}

function addRadiusMarkers(
  viewer: Cesium.Viewer,
  config: RadiationBeltConfig
): void {
  const angles = [90, 180, 270];

  angles.forEach((angle) => {
    const innerPos = Cesium.Cartesian3.fromDegrees(
      angle,
      0,
      config.innerRadiusKm * 1000
    );

    viewer.entities.add({
      position: innerPos,
      point: {
        pixelSize: 6,
        color: Cesium.Color.fromCssColorString(config.color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `${config.innerRadiusKm.toFixed(0)} km`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#00000088'),
        pixelOffset: new Cesium.Cartesian2(0, -15),
        scale: 0.8,
      },
    });
  });
}

function generateBeltDescription(config: RadiationBeltConfig): string {
  const hazardLevel = config.type === 'inner' ? 'HIGH' : 'MODERATE';

  return `
    <div style="font-family: monospace; line-height: 1.6;">
      <h3 style="margin: 0 0 8px 0; color: ${config.color};">${config.name}</h3>
      <table style="width: 100%; font-size: 12px;">
        <tr><td><strong>Type:</strong></td><td>${config.type.toUpperCase()}</td></tr>
        <tr><td><strong>Altitude Range:</strong></td><td>${config.innerRadiusKm.toFixed(0)} - ${config.outerRadiusKm.toFixed(0)} km</td></tr>
        <tr><td><strong>Peak Flux:</strong></td><td>${formatFlux(config.peakFluxProtons)} protons/cm²/s</td></tr>
        <tr><td><strong>Hazard Level:</strong></td><td><span style="color: ${hazardLevel === 'HIGH' ? '#ff6b6b' : '#f59e0b'};">${hazardLevel}</span></td></tr>
        <tr><td><strong>Main Particles:</strong></td><td>${config.type === 'inner' ? 'Protons' : 'Electrons'}</td></tr>
      </table>
      <p style="margin-top: 8px; font-size: 11px; color: #aaa;">
        ${config.type === 'inner'
          ? 'High-energy protons. May affect satellite electronics and optical sensors.'
          : 'Relativistic electrons. Can cause surface charging and sensor noise.'}
      </p>
    </div>
  `;
}

function formatFlux(flux: number): string {
  if (flux >= 1e9) return `${(flux / 1e9).toFixed(1)}B`;
  if (flux >= 1e6) return `${(flux / 1e6).toFixed(1)}M`;
  if (flux >= 1e3) return `${(flux / 1e3).toFixed(1)}K`;
  return flux.toFixed(0);
}

function createWarningIconDataURL(): string {
  const svg = `
    <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#ff6b6b" opacity="0.9"/>
      <path d="M16 10 L16 18 M16 20 L16 22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

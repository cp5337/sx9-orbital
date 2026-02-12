export interface OrbitalElements {
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPerigee: number;
  meanAnomaly: number;
  bstar: number;
  epoch: Date;
}

export interface ECICoordinates {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface GeodeticCoordinates {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface RadiationParameters {
  lShell: number;
  bFieldMagnitude: number;
  bFieldVector: { x: number; y: number; z: number };
  radiationFlux: number;
  protonFlux: number;
  electronFlux: number;
  inRadiationBelt: boolean;
  inSAA: boolean;
  seuProbability: number;
}

const EARTH_RADIUS_KM = 6371.0;
const EARTH_FLATTENING = 1.0 / 298.257223563;
const EARTH_ECC_SQ = 2 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;
const MU_EARTH = 398600.4418;
const J2 = 0.00108263;
const MINUTES_PER_DAY = 1440.0;
const TWO_PI = 2.0 * Math.PI;

export function simplifiedSGP4Propagate(
  elements: OrbitalElements,
  minutesSinceEpoch: number
): ECICoordinates {
  const n0 = elements.meanMotion * (TWO_PI / MINUTES_PER_DAY);
  const a0 = Math.pow(MU_EARTH / (n0 * n0), 1.0 / 3.0);

  const p = a0 * (1 - elements.eccentricity * elements.eccentricity);

  const delta1 = (3.0 / 2.0) * J2 * (EARTH_RADIUS_KM * EARTH_RADIUS_KM) / (p * p);
  const a1 = a0 * (1 - delta1 * ((1.0 / 3.0) + delta1 * (1 + (134.0 / 81.0) * delta1)));

  const n = n0 / (1 + delta1);

  const M = elements.meanAnomaly + n * minutesSinceEpoch;
  const E = solveKeplerEquation(M, elements.eccentricity);

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  const nu = 2 * Math.atan2(
    Math.sqrt(1 + elements.eccentricity) * sinE,
    Math.sqrt(1 - elements.eccentricity) * (cosE - elements.eccentricity)
  );

  const r = a1 * (1 - elements.eccentricity * cosE);

  const u = elements.argPerigee + nu;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);

  const xOrbital = r * cosU;
  const yOrbital = r * sinU;

  const cosRaan = Math.cos(elements.raan);
  const sinRaan = Math.sin(elements.raan);
  const cosInc = Math.cos(elements.inclination);
  const sinInc = Math.sin(elements.inclination);

  const x = xOrbital * cosRaan - yOrbital * cosInc * sinRaan;
  const y = xOrbital * sinRaan + yOrbital * cosInc * cosRaan;
  const z = yOrbital * sinInc;

  const vMag = Math.sqrt(MU_EARTH / a1);
  const vxOrbital = -vMag * sinE;
  const vyOrbital = vMag * Math.sqrt(1 - elements.eccentricity * elements.eccentricity) * cosE;

  const vx = vxOrbital * cosRaan - vyOrbital * cosInc * sinRaan;
  const vy = vxOrbital * sinRaan + vyOrbital * cosInc * cosRaan;
  const vz = vyOrbital * sinInc;

  return { x, y, z, vx, vy, vz };
}

function solveKeplerEquation(M: number, ecc: number, tolerance = 1e-8): number {
  let E = M;
  let delta = 1;
  let iterations = 0;

  while (Math.abs(delta) > tolerance && iterations < 10) {
    delta = (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
    E -= delta;
    iterations++;
  }

  return E;
}

export function eciToGeodetic(eci: ECICoordinates, gmst: number): GeodeticCoordinates {
  const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);

  const longitude = Math.atan2(eci.y, eci.x) - gmst;
  let lon = ((longitude * 180 / Math.PI + 180) % 360) - 180;

  let lat = Math.asin(eci.z / r) * 180 / Math.PI;

  const phi = lat * Math.PI / 180;
  const C = 1 / Math.sqrt(1 - EARTH_ECC_SQ * Math.sin(phi) * Math.sin(phi));
  const altitude = r - EARTH_RADIUS_KM * C;

  return {
    latitude: lat,
    longitude: lon,
    altitude: altitude
  };
}

export function calculateGMST(date: Date): number {
  const jd = dateToJulianDate(date);
  const jdUT1 = jd;
  const T = (jdUT1 - 2451545.0) / 36525.0;

  let gmst = 280.46061837 + 360.98564736629 * (jdUT1 - 2451545.0) +
             T * T * (0.000387933 - T / 38710000.0);

  gmst = (gmst % 360);
  if (gmst < 0) gmst += 360;

  return gmst * Math.PI / 180;
}

function dateToJulianDate(date: Date): number {
  return date.getTime() / 86400000.0 + 2440587.5;
}

export function geodeticToECI(geodetic: GeodeticCoordinates, gmst: number): ECICoordinates {
  const lat = geodetic.latitude * Math.PI / 180;
  const lon = geodetic.longitude * Math.PI / 180;
  const alt = geodetic.altitude;

  const C = EARTH_RADIUS_KM / Math.sqrt(1 - EARTH_ECC_SQ * Math.sin(lat) * Math.sin(lat));
  const S = C * (1 - EARTH_ECC_SQ);

  const xGeo = (C + alt) * Math.cos(lat) * Math.cos(lon);
  const yGeo = (C + alt) * Math.cos(lat) * Math.sin(lon);
  const zGeo = (S + alt) * Math.sin(lat);

  const x = xGeo * Math.cos(gmst) - yGeo * Math.sin(gmst);
  const y = xGeo * Math.sin(gmst) + yGeo * Math.cos(gmst);
  const z = zGeo;

  return { x, y, z, vx: 0, vy: 0, vz: 0 };
}

export function calculateLShell(geodetic: GeodeticCoordinates): number {
  const lat = geodetic.latitude * Math.PI / 180;
  const r = (EARTH_RADIUS_KM + geodetic.altitude) / EARTH_RADIUS_KM;

  const cosLat = Math.cos(lat);
  const L = r / (cosLat * cosLat);

  return L;
}

export function calculateMagneticField(
  eci: ECICoordinates
): { magnitude: number; x: number; y: number; z: number } {
  const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);

  const dipoleMoment = 7.94e15;
  const rMeters = r * 1000;
  const rCubed = rMeters * rMeters * rMeters;

  const theta = Math.acos(eci.z / r);
  const cosThetaSq = Math.cos(theta) * Math.cos(theta);

  const magnitude = (dipoleMoment / rCubed) * Math.sqrt(1 + 3 * cosThetaSq);

  const bx = 3 * dipoleMoment * eci.x * eci.z / (rCubed * rMeters * rMeters);
  const by = 3 * dipoleMoment * eci.y * eci.z / (rCubed * rMeters * rMeters);
  const bz = dipoleMoment * (3 * eci.z * eci.z - r * r) / (rCubed * rMeters * rMeters);

  return {
    magnitude: magnitude * 1e9,
    x: bx * 1e9,
    y: by * 1e9,
    z: bz * 1e9
  };
}

export function calculateRadiationFlux(lShell: number, altitude: number): number {
  if (lShell < 1.2 || lShell > 7) return 0;

  if (lShell >= 1.5 && lShell <= 2.5 && altitude > 1000 && altitude < 6000) {
    const innerPeak = Math.exp(-Math.pow((lShell - 1.8) / 0.4, 2));
    return innerPeak * 1e8;
  }

  if (lShell >= 3.5 && lShell <= 5.5 && altitude > 10000 && altitude < 25000) {
    const outerPeak = Math.exp(-Math.pow((lShell - 4.5) / 0.8, 2));
    return outerPeak * 1e7;
  }

  return 0;
}

export function isInSouthAtlanticAnomaly(geodetic: GeodeticCoordinates): boolean {
  const lat = geodetic.latitude;
  const lon = geodetic.longitude;
  const alt = geodetic.altitude;

  if (alt < 200 || alt > 800) return false;

  const saaLat = -30;
  const saaLon = -50;
  const latRadius = 25;
  const lonRadius = 35;

  const latDist = Math.abs(lat - saaLat);
  const lonDist = Math.abs(lon - saaLon);

  return (latDist < latRadius && lonDist < lonRadius);
}

export function calculateRadiationParameters(
  eci: ECICoordinates,
  geodetic: GeodeticCoordinates
): RadiationParameters {
  const lShell = calculateLShell(geodetic);
  const bField = calculateMagneticField(eci);
  const radiationFlux = calculateRadiationFlux(lShell, geodetic.altitude);

  const protonFlux = radiationFlux * 0.6;
  const electronFlux = radiationFlux * 0.4;

  const inRadiationBelt = (lShell >= 1.5 && lShell <= 2.5) || (lShell >= 3.5 && lShell <= 5.5);
  const inSAA = isInSouthAtlanticAnomaly(geodetic);

  const seuProbability = Math.min(radiationFlux / 1e9, 1.0);

  return {
    lShell,
    bFieldMagnitude: bField.magnitude,
    bFieldVector: { x: bField.x, y: bField.y, z: bField.z },
    radiationFlux,
    protonFlux,
    electronFlux,
    inRadiationBelt,
    inSAA,
    seuProbability
  };
}

export function calculateLinkGeometry(
  satECI: ECICoordinates,
  groundGeodetic: GeodeticCoordinates,
  gmst: number
): {
  distance: number;
  azimuth: number;
  elevation: number;
  visible: boolean;
} {
  const groundECI = geodeticToECI(groundGeodetic, gmst);

  const dx = satECI.x - groundECI.x;
  const dy = satECI.y - groundECI.y;
  const dz = satECI.z - groundECI.z;

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const lat = groundGeodetic.latitude * Math.PI / 180;
  const lon = groundGeodetic.longitude * Math.PI / 180;

  const localX = -Math.sin(lon) * dx + Math.cos(lon) * dy;
  const localY = -Math.sin(lat) * Math.cos(lon) * dx - Math.sin(lat) * Math.sin(lon) * dy + Math.cos(lat) * dz;
  const localZ = Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz;

  const azimuth = Math.atan2(localX, localY) * 180 / Math.PI;
  const elevation = Math.asin(localZ / distance) * 180 / Math.PI;

  const visible = elevation > 10;

  return {
    distance,
    azimuth: (azimuth + 360) % 360,
    elevation,
    visible
  };
}

export function calculateDopplerShift(
  satECI: ECICoordinates,
  groundECI: ECICoordinates,
  opticalFrequencyGHz: number = 194
): number {
  const dx = satECI.x - groundECI.x;
  const dy = satECI.y - groundECI.y;
  const dz = satECI.z - groundECI.z;

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const radialVelocity = (dx * satECI.vx + dy * satECI.vy + dz * satECI.vz) / distance;

  const c = 299792.458;
  const dopplerShift = opticalFrequencyGHz * radialVelocity / c;

  return dopplerShift;
}

export function calculateAtmosphericAttenuation(
  elevation: number,
  cloudCover: number,
  precipitation: number,
  visibility: number
): number {
  if (elevation < 0) return 999;

  const airMass = 1 / Math.sin((elevation + 5.0) * Math.PI / 180);
  const clearSkyAttenuation = 0.2 * airMass;

  const cloudAttenuation = cloudCover * 0.003;

  const rainAttenuation = precipitation > 0 ? Math.pow(precipitation, 0.6) * 0.5 : 0;

  const visibilityAttenuation = visibility < 10 ? (10 - visibility) * 0.1 : 0;

  return clearSkyAttenuation + cloudAttenuation + rainAttenuation + visibilityAttenuation;
}

/**
 * Diagnostic: reproduce satellite coordinate out-of-bounds error
 * Run: npx tsx src/scripts/diagnoseSatCoords.ts
 *
 * This traces the EXACT same code path as the animation loop:
 *   createOrbitalElements → simplifiedSGP4Propagate → eciToGeodetic
 * with real satellite data values to find where coordinates go bad.
 */

// ---- Inline the exact same math from orbitalMechanics.ts ----

const EARTH_RADIUS_KM = 6371.0;
const EARTH_FLATTENING = 1.0 / 298.257223563;
const EARTH_ECC_SQ = 2 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;
const MU_EARTH = 398600.4418;
const J2 = 0.00108263;
const MINUTES_PER_DAY = 1440.0;
const TWO_PI = 2.0 * Math.PI;

interface OrbitalElements {
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPerigee: number;
  meanAnomaly: number;
  bstar: number;
  epoch: Date;
}

interface ECICoordinates { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
interface GeodeticCoordinates { latitude: number; longitude: number; altitude: number; }

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

function simplifiedSGP4Propagate(elements: OrbitalElements, minutesSinceEpoch: number): ECICoordinates {
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
  return { x, y, z, vx: 0, vy: 0, vz: 0 };
}

function dateToJulianDate(date: Date): number {
  return date.getTime() / 86400000.0 + 2440587.5;
}

function calculateGMST(date: Date): number {
  const jd = dateToJulianDate(date);
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * (0.000387933 - T / 38710000.0);
  gmst = gmst % 360;
  if (gmst < 0) gmst += 360;
  return gmst * Math.PI / 180;
}

function eciToGeodetic(eci: ECICoordinates, gmst: number): GeodeticCoordinates {
  const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
  const longitude = Math.atan2(eci.y, eci.x) - gmst;
  let lon = ((longitude * 180 / Math.PI + 180) % 360) - 180;
  let lat = Math.asin(eci.z / r) * 180 / Math.PI;
  const phi = lat * Math.PI / 180;
  const C = 1 / Math.sqrt(1 - EARTH_ECC_SQ * Math.sin(phi) * Math.sin(phi));
  const altitude = r - EARTH_RADIUS_KM * C;
  return { latitude: lat, longitude: lon, altitude };
}

// ---- Exact same createOrbitalElements from orbitalAnimation.ts:156-176 ----

function createOrbitalElements(altitudeKm: number, inclinationDeg: number, longitudeDeg: number, latitudeDeg: number): OrbitalElements {
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

// ---- TEST: Known MEO satellite values ----

// Typical Supabase satellite row values
const testSatellites = [
  { name: 'MEO-001', lat: 45.0, lon: -73.5, alt: 8062, inc: 55.0 },
  { name: 'MEO-002', lat: 0.0, lon: 0.0, alt: 8062, inc: 55.0 },
  { name: 'MEO-003', lat: -30.0, lon: 120.0, alt: 8062, inc: 55.0 },
  { name: 'MEO-004', lat: 70.0, lon: -170.0, alt: 8062, inc: 55.0 },
];

console.log('=== SATELLITE COORDINATE DIAGNOSTIC ===\n');

const now = new Date();
const gmst = calculateGMST(now);
console.log(`Time: ${now.toISOString()}`);
console.log(`GMST: ${(gmst * 180 / Math.PI).toFixed(4)}°\n`);

for (const sat of testSatellites) {
  console.log(`--- ${sat.name} (input: lat=${sat.lat}, lon=${sat.lon}, alt=${sat.alt}km, inc=${sat.inc}°) ---`);

  const elements = createOrbitalElements(sat.alt, sat.inc, sat.lon, sat.lat);
  console.log(`  Orbital Elements:`);
  console.log(`    meanMotion (rev/day): ${elements.meanMotion.toFixed(6)}`);
  console.log(`    eccentricity: ${elements.eccentricity}`);
  console.log(`    inclination (rad): ${elements.inclination.toFixed(6)} (${(elements.inclination * 180/Math.PI).toFixed(2)}°)`);
  console.log(`    RAAN (rad): ${elements.raan.toFixed(6)} (${(elements.raan * 180/Math.PI).toFixed(2)}°) ← from longitude ${sat.lon}°`);
  console.log(`    meanAnomaly (rad): ${elements.meanAnomaly.toFixed(6)} (${(elements.meanAnomaly * 180/Math.PI).toFixed(2)}°) ← from latitude ${sat.lat}°`);

  // Compute n0 (rad/min) to verify units
  const n0 = elements.meanMotion * (TWO_PI / MINUTES_PER_DAY);
  const a0_computed = Math.pow(MU_EARTH / (n0 * n0), 1.0 / 3.0);
  console.log(`  Derived:`);
  console.log(`    n0 (rad/min): ${n0.toFixed(8)}`);
  console.log(`    a0 (km): ${a0_computed.toFixed(2)} (expected: ${(6371 + sat.alt).toFixed(2)})`);

  // Test at t=0, t=1min, t=5min, t=30min
  for (const t of [0, 0.1, 1, 5, 30, 60]) {
    const eci = simplifiedSGP4Propagate(elements, t);
    const geodetic = eciToGeodetic(eci, gmst);
    const r = Math.sqrt(eci.x**2 + eci.y**2 + eci.z**2);

    const latOK = Math.abs(geodetic.latitude) <= 90;
    const lonOK = Math.abs(geodetic.longitude) <= 180;
    const altOK = geodetic.altitude > 0 && geodetic.altitude < 100000;
    const status = (latOK && lonOK && altOK) ? 'OK' : '** OUT OF BOUNDS **';

    console.log(`  t=${String(t).padStart(5)}min: ECI(${eci.x.toFixed(1)}, ${eci.y.toFixed(1)}, ${eci.z.toFixed(1)}) r=${r.toFixed(1)}km → geo(lat=${geodetic.latitude.toFixed(4)}°, lon=${geodetic.longitude.toFixed(4)}°, alt=${geodetic.altitude.toFixed(1)}km) ${status}`);
  }
  console.log('');
}

// ---- REFERENCE: What correct MEO values should look like ----
console.log('=== REFERENCE: Expected values for 8062km MEO ===');
console.log(`  Expected semi-major axis: ${6371 + 8062} = 14433 km`);
console.log(`  Expected orbital period: ${(2 * Math.PI * Math.sqrt(14433**3 / 398600.4418) / 60).toFixed(1)} minutes`);
console.log(`  Expected mean motion: ${(MINUTES_PER_DAY / (2 * Math.PI * Math.sqrt(14433**3 / 398600.4418) / 60)).toFixed(4)} rev/day`);
console.log(`  Expected altitude from geodetic: ~8062 km (should NOT be ~8000 negative or >50000)`);

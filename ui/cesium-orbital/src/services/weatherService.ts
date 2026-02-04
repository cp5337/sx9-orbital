import type { WeatherCondition } from '@/types';

// Gateway API for weather (uses Open-Meteo, no API key needed)
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:18700';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (gateway has its own cache)
const weatherCache = new Map<string, { data: WeatherCondition; timestamp: number }>();

/**
 * Fetch weather from the gateway API (Open-Meteo backend)
 */
export async function fetchWeatherForLocation(
  lat: number,
  lon: number
): Promise<WeatherCondition> {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${GATEWAY_URL}/api/v1/weather?lat=${lat}&lon=${lon}`
    );

    if (!response.ok) {
      throw new Error(`Gateway weather API error: ${response.status}`);
    }

    const data = await response.json();

    // Map gateway response to WeatherCondition
    const weather: WeatherCondition = {
      score: data.fso_score?.quality || 0.5,
      conditions: mapWeatherCode(data.conditions?.cloud_cover_pct || 0),
      cloudCover: data.conditions?.cloud_cover_pct || 0,
      visibility: data.conditions?.visibility_km || 10,
      windSpeed: data.conditions?.wind_speed_ms || 0,
      precipitation: data.conditions?.precip_intensity || 0,
      temperature: data.conditions?.temperature_c || 15,
    };

    weatherCache.set(cacheKey, { data: weather, timestamp: Date.now() });
    return weather;
  } catch (error) {
    console.warn('Gateway weather API failed, using mock data:', error);
    return generateMockWeather(lat, lon);
  }
}

/**
 * Map cloud cover percentage to weather condition string
 */
function mapWeatherCode(cloudCover: number): string {
  if (cloudCover < 10) return 'Clear';
  if (cloudCover < 40) return 'PartlyCloudy';
  if (cloudCover < 70) return 'Clouds';
  return 'Overcast';
}

/**
 * Calculate FSO weather score from conditions
 */
function calculateWeatherScore(
  cloudCover: number,
  visibility: number,
  precipitation: number,
  windSpeed: number
): number {
  const cloudScore = 1 - cloudCover / 100;
  const visibilityScore = Math.min(visibility / 10, 1);
  const precipScore = precipitation > 0 ? Math.max(0, 1 - precipitation / 10) : 1;
  const windScore = Math.max(0, 1 - windSpeed / 50);
  return cloudScore * 0.3 + visibilityScore * 0.3 + precipScore * 0.25 + windScore * 0.15;
}

function generateMockWeather(lat: number, lon: number): WeatherCondition {
  const seed = Math.abs(lat + lon);
  const cloudCover = (Math.sin(seed * 0.1) * 0.5 + 0.5) * 60;
  const visibility = 10 + Math.cos(seed * 0.15) * 5;
  const precipitation = Math.max(0, Math.sin(seed * 0.2) * 2);
  const windSpeed = 10 + Math.cos(seed * 0.25) * 15;
  const temperature = 15 + Math.sin(lat * 0.02) * 15;

  const score = calculateWeatherScore(cloudCover, visibility, precipitation, windSpeed);

  const conditions =
    cloudCover > 70
      ? 'Clouds'
      : cloudCover > 40
      ? 'PartlyCloudy'
      : precipitation > 1
      ? 'Rain'
      : 'Clear';

  return {
    score,
    conditions,
    cloudCover,
    visibility,
    windSpeed,
    precipitation,
    temperature,
  };
}

export async function fetchBatchWeather(
  locations: Array<{ lat: number; lon: number }>
): Promise<WeatherCondition[]> {
  const promises = locations.map((loc) => fetchWeatherForLocation(loc.lat, loc.lon));
  return Promise.all(promises);
}

export function clearWeatherCache(): void {
  weatherCache.clear();
}

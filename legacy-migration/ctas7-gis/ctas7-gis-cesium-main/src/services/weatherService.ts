import type { WeatherCondition } from '@/types';

const CACHE_DURATION = 15 * 60 * 1000;
const weatherCache = new Map<string, { data: WeatherCondition; timestamp: number }>();

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

  return (cloudScore * 0.3 + visibilityScore * 0.3 + precipScore * 0.25 + windScore * 0.15);
}

export async function fetchWeatherForLocation(
  lat: number,
  lon: number
): Promise<WeatherCondition> {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const apiKey = import.meta.env.VITE_WEATHER_API_KEY;

  if (!apiKey) {
    return generateMockWeather(lat, lon);
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    const cloudCover = data.clouds?.all || 0;
    const visibility = (data.visibility || 10000) / 1000;
    const precipitation = data.rain?.['1h'] || data.snow?.['1h'] || 0;
    const windSpeed = data.wind?.speed || 0;
    const temperature = data.main?.temp || 15;

    const conditions = data.weather?.[0]?.main || 'Clear';
    const score = calculateWeatherScore(cloudCover, visibility, precipitation, windSpeed);

    const weather: WeatherCondition = {
      score,
      conditions,
      cloudCover,
      visibility,
      windSpeed,
      precipitation,
      temperature,
    };

    weatherCache.set(cacheKey, { data: weather, timestamp: Date.now() });

    return weather;
  } catch (error) {
    console.warn('Weather API failed, using mock data:', error);
    return generateMockWeather(lat, lon);
  }
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

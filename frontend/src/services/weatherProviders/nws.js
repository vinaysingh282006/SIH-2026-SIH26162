/**
 * SkyGuard AI — NOAA National Weather Service (NWS) Provider Adapter
 * =================================================================
 * Official United States meteorological data service (weather.gov).
 * 
 * Key Architectural Quirks:
 * 1. Auth & Identification: NWS does not use an API key. Instead, RFC-compliant
 *    User-Agent identification with contact info is MANDATORY (e.g. "SkyGuardAI/1.0 (contact@domain.com)").
 * 2. Two-Step Gridpoint Flow:
 *    - Step 1: Call /points/{lat},{lon} to look up the National Weather Service
 *      WFO office code, grid X, and grid Y.
 *    - Step 2: Follow the hypermedia endpoints returned in `properties.forecast`
 *      and `properties.forecastHourly` to retrieve actual time-series predictions.
 * 3. Geographic Boundary: NWS strictly serves United States territories. Requests
 *    for international coordinates return 404 Problem Details and are caught gracefully.
 */

const NWS_CONDITION_MAP = {
  'Sunny': { condition: 'Clear', icon: '☀️' },
  'Clear': { condition: 'Clear', icon: '☀️' },
  'Mostly Sunny': { condition: 'Mainly Clear', icon: '🌤️' },
  'Partly Sunny': { condition: 'Partly Cloudy', icon: '⛅' },
  'Partly Cloudy': { condition: 'Partly Cloudy', icon: '⛅' },
  'Mostly Cloudy': { condition: 'Overcast', icon: '☁️' },
  'Cloudy': { condition: 'Overcast', icon: '☁️' },
  'Rain': { condition: 'Rain', icon: '🌧️' },
  'Rain Showers': { condition: 'Rain Showers', icon: '🌦️' },
  'Scattered Showers': { condition: 'Rain Showers', icon: '🌦️' },
  'Thunderstorms': { condition: 'Thunderstorm', icon: '⛈️' },
  'Snow': { condition: 'Snow', icon: '❄️' },
  'Fog': { condition: 'Fog', icon: '🌫️' },
  'Haze': { condition: 'Haze', icon: '🌫️' },
};

function mapNwsCondition(shortForecast = '') {
  for (const [key, value] of Object.entries(NWS_CONDITION_MAP)) {
    if (shortForecast.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return { condition: shortForecast || 'Clear', icon: '🌤️' };
}

function parseWindSpeed(windSpeedStr = '') {
  // Typical formats: "7 mph", "5 to 10 mph"
  const matches = windSpeedStr.match(/(\d+)/g);
  if (!matches || matches.length === 0) return 0;
  const mph = Number(matches[matches.length - 1]); // take highest if range
  return Number((mph * 1.60934).toFixed(1)); // Convert mph to km/h
}

function parseWindDir(windDirStr = '') {
  const directions = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return directions[windDirStr.toUpperCase()] ?? 0;
}

export const NwsProvider = {
  id: 'nws',
  name: 'NOAA NWS',

  isEnabled() {
    // Enabled by default as NWS requires only a contact User-Agent
    return true;
  },

  async fetchWeather({ lat, lon }) {
    const userAgent =
      import.meta.env?.VITE_NWS_USER_AGENT ||
      'SkyGuardAI/1.0 (skyguard-weather-monitoring@example.com)';

    const headers = {
      'User-Agent': userAgent,
      Accept: 'application/geo+json',
    };

    // Step 1: Look up gridpoint for coordinate pair
    const pointUrl = `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
    const pointRes = await fetch(pointUrl, { headers, signal: AbortSignal.timeout(8000) });

    if (pointRes.status === 404) {
      throw new Error(`NOAA NWS: Coordinates (${lat.toFixed(2)}, ${lon.toFixed(2)}) are outside US territory.`);
    }

    if (!pointRes.ok) {
      throw new Error(`NOAA NWS HTTP ${pointRes.status}: ${pointRes.statusText}`);
    }

    const pointData = await pointRes.json();
    const props = pointData.properties || {};

    const forecastHourlyUrl = props.forecastHourly;
    const forecastDailyUrl = props.forecast;

    if (!forecastHourlyUrl && !forecastDailyUrl) {
      throw new Error('NOAA NWS: No forecast endpoints available for this gridpoint.');
    }

    // Step 2: Fetch hourly and daily forecasts in parallel
    const [hourlyRes, dailyRes] = await Promise.all([
      forecastHourlyUrl ? fetch(forecastHourlyUrl, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null) : null,
      forecastDailyUrl ? fetch(forecastDailyUrl, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null) : null,
    ]);

    const hourlyData = hourlyRes && hourlyRes.ok ? await hourlyRes.json().catch(() => null) : null;
    const dailyData = dailyRes && dailyRes.ok ? await dailyRes.json().catch(() => null) : null;

    return this.normalize(hourlyData, dailyData, lat, lon);
  },

  normalize(hourlyData, dailyData, lat, lon) {
    const hourlyPeriods = hourlyData?.properties?.periods || [];
    const dailyPeriods = dailyData?.properties?.periods || [];

    const currentPeriod = hourlyPeriods[0] || dailyPeriods[0] || {};
    const shortForecast = currentPeriod.shortForecast || 'Fair';
    const conditionInfo = mapNwsCondition(shortForecast);

    // NWS returns temperatures in Fahrenheit by default
    const tempF = Number((currentPeriod.temperature ?? 70).toFixed(1));
    const tempC = Number((((tempF - 32) * 5) / 9).toFixed(1));
    const feelsLike = tempC; // NWS doesn't always specify apparent temp in standard forecast periods

    const humidity = Number(currentPeriod.relativeHumidity?.value ?? 55);
    const windSpeedKmH = parseWindSpeed(currentPeriod.windSpeed);
    const windDir = parseWindDir(currentPeriod.windDirection);
    const precipitation = Number(currentPeriod.probabilityOfPrecipitation?.value ?? 0);

    // Normalize hourly (next 24 hours)
    const forecastHourly = hourlyPeriods.slice(0, 24).map((p) => {
      const pF = Number((p.temperature ?? 70).toFixed(1));
      const pC = Number((((pF - 32) * 5) / 9).toFixed(1));
      const pCond = mapNwsCondition(p.shortForecast);
      return {
        time: p.startTime,
        tempC: pC,
        condition: pCond.condition,
        icon: pCond.icon,
      };
    });

    // Normalize daily periods into calendar days (NWS divides by "Tonight", "Wednesday", "Wednesday Night", etc.)
    const dailyMap = new Map();
    for (const p of dailyPeriods) {
      const dateKey = (p.startTime || '').split('T')[0];
      const pF = Number((p.temperature ?? 70).toFixed(1));
      const pC = Number((((pF - 32) * 5) / 9).toFixed(1));
      const pCond = mapNwsCondition(p.shortForecast);

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          minTempC: pC,
          maxTempC: pC,
          condition: pCond.condition,
          icon: pCond.icon,
        });
      } else {
        const entry = dailyMap.get(dateKey);
        entry.minTempC = Math.min(entry.minTempC, pC);
        entry.maxTempC = Math.max(entry.maxTempC, pC);
      }
    }

    const forecastDaily = Array.from(dailyMap.values()).map(d => ({
      ...d,
      minTempC: Number(d.minTempC.toFixed(1)),
      maxTempC: Number(d.maxTempC.toFixed(1)),
    }));

    return {
      source: 'NOAA NWS',
      sourceId: this.id,
      lat,
      lon,
      tempC,
      tempF,
      feelsLike,
      humidity,
      windSpeed: windSpeedKmH,
      windDir,
      precipitation,
      condition: conditionInfo.condition,
      icon: conditionInfo.icon,
      forecastHourly,
      forecastDaily,
      fetchedAt: new Date().toISOString(),
    };
  },
};

/**
 * SkyGuard AI — Open-Meteo Provider Adapter
 * ==========================================
 * Free, keyless global meteorological API (ECMWF / DWD / NOAA blend).
 * Does not require an API key for standard non-commercial tiers.
 */

const WMO_CODE_MAP = {
  0:  { condition: 'Clear',           icon: '☀️' },
  1:  { condition: 'Mainly Clear',    icon: '🌤️' },
  2:  { condition: 'Partly Cloudy',   icon: '⛅' },
  3:  { condition: 'Overcast',        icon: '☁️' },
  45: { condition: 'Fog',             icon: '🌫️' },
  48: { condition: 'Freezing Fog',    icon: '🌫️' },
  51: { condition: 'Light Drizzle',   icon: '🌦️' },
  53: { condition: 'Moderate Drizzle',icon: '🌧️' },
  55: { condition: 'Dense Drizzle',   icon: '🌧️' },
  61: { condition: 'Slight Rain',     icon: '🌦️' },
  63: { condition: 'Moderate Rain',   icon: '🌧️' },
  65: { condition: 'Heavy Rain',      icon: '⛈️' },
  71: { condition: 'Slight Snow',     icon: '🌨️' },
  73: { condition: 'Moderate Snow',   icon: '❄️' },
  75: { condition: 'Heavy Snow',      icon: '❄️' },
  80: { condition: 'Rain Showers',    icon: '🌦️' },
  81: { condition: 'Heavy Showers',   icon: '🌧️' },
  82: { condition: 'Violent Showers', icon: '⛈️' },
  95: { condition: 'Thunderstorm',    icon: '⚡' },
  96: { condition: 'Thunderstorm with Hail', icon: '⛈️' },
  99: { condition: 'Severe Thunderstorm',    icon: '🌩️' },
};

export const OpenMeteoProvider = {
  id: 'open-meteo',
  name: 'Open-Meteo',
  isEnabled: () => true, // Open-Meteo core is 100% free and keyless

  async fetchWeather({ lat, lon }) {
    const apiKey = import.meta.env?.VITE_OPENMETEO_API_KEY || '';
    const baseUrl = 'https://api.open-meteo.com/v1/forecast';

    const url = new URL(baseUrl);
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lon.toFixed(4));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m');
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability,weather_code');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    if (apiKey) url.searchParams.set('apikey', apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return this.normalize(data, lat, lon);
  },

  normalize(data, lat, lon) {
    const current = data.current || {};
    const code = current.weather_code ?? 0;
    const weatherInfo = WMO_CODE_MAP[code] || { condition: 'Clear', icon: '☀️' };

    const tempC = Number((current.temperature_2m ?? 0).toFixed(1));
    const tempF = Number(((tempC * 9) / 5 + 32).toFixed(1));
    const feelsLike = Number((current.apparent_temperature ?? tempC).toFixed(1));

    // Normalize hourly (next 24 hours)
    const hourly = data.hourly || {};
    const hourlyTimes = hourly.time || [];
    const hourlyTemps = hourly.temperature_2m || [];
    const hourlyCodes = hourly.weather_code || [];
    const forecastHourly = [];

    const nowIso = new Date().toISOString();
    let count = 0;
    for (let i = 0; i < hourlyTimes.length && count < 24; i++) {
      if (hourlyTimes[i] >= nowIso.slice(0, 13)) {
        const hCode = hourlyCodes[i] ?? 0;
        forecastHourly.push({
          time: hourlyTimes[i],
          tempC: Number((hourlyTemps[i] ?? 0).toFixed(1)),
          condition: (WMO_CODE_MAP[hCode] || weatherInfo).condition,
          icon: (WMO_CODE_MAP[hCode] || weatherInfo).icon,
        });
        count++;
      }
    }

    // Normalize daily (7 days)
    const daily = data.daily || {};
    const dailyTimes = daily.time || [];
    const dailyMax = daily.temperature_2m_max || [];
    const dailyMin = daily.temperature_2m_min || [];
    const dailyCodes = daily.weather_code || [];
    const forecastDaily = [];

    for (let i = 0; i < dailyTimes.length; i++) {
      const dCode = dailyCodes[i] ?? 0;
      forecastDaily.push({
        date: dailyTimes[i],
        maxTempC: Number((dailyMax[i] ?? tempC).toFixed(1)),
        minTempC: Number((dailyMin[i] ?? tempC).toFixed(1)),
        condition: (WMO_CODE_MAP[dCode] || weatherInfo).condition,
        icon: (WMO_CODE_MAP[dCode] || weatherInfo).icon,
      });
    }

    return {
      source: 'Open-Meteo',
      sourceId: this.id,
      lat,
      lon,
      tempC,
      tempF,
      feelsLike,
      humidity: Number(current.relative_humidity_2m ?? 0),
      windSpeed: Number((current.wind_speed_10m ?? 0).toFixed(1)),
      windDir: Number(current.wind_direction_10m ?? 0),
      precipitation: Number(current.precipitation ?? 0),
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      forecastHourly,
      forecastDaily,
      fetchedAt: new Date().toISOString(),
    };
  },
};

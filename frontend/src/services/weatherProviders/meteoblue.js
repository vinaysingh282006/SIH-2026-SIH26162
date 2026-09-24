/**
 * SkyGuard AI — Meteoblue Provider Adapter
 * ========================================
 * High-precision numerical weather prediction from Meteoblue (Switzerland).
 * Requires VITE_METEOBLUE_API_KEY for commercial/education packages.
 */

// Meteoblue pictocode mapping
const METEOBLUE_PICTO_MAP = {
  1:  { condition: 'Clear',           icon: '☀️' },
  2:  { condition: 'Mostly Sunny',    icon: '🌤️' },
  3:  { condition: 'Partly Cloudy',   icon: '⛅' },
  4:  { condition: 'Overcast',        icon: '☁️' },
  5:  { condition: 'Fog',             icon: '🌫️' },
  6:  { condition: 'Rain',            icon: '🌧️' },
  7:  { condition: 'Rain / Snow Mix', icon: '🌨️' },
  8:  { condition: 'Snow',            icon: '❄️' },
  9:  { condition: 'Rain Showers',    icon: '🌦️' },
  10: { condition: 'Snow Showers',    icon: '🌨️' },
  11: { condition: 'Thunderstorm',    icon: '⚡' },
  12: { condition: 'Hailstorm',       icon: '⛈️' },
  13: { condition: 'Heavy Rain',      icon: '⛈️' },
  14: { condition: 'Heavy Snow',      icon: '❄️' },
  15: { condition: 'Windy / Sunny',   icon: '💨' },
  16: { condition: 'Windy / Cloudy',  icon: '💨' },
  17: { condition: 'Freezing Rain',   icon: '🌧️' },
};

export const MeteoblueProvider = {
  id: 'meteoblue',
  name: 'Meteoblue',

  isEnabled() {
    const key = import.meta.env?.VITE_METEOBLUE_API_KEY;
    return typeof key === 'string' && key.trim().length > 0 && !key.includes('your_');
  },

  async fetchWeather({ lat, lon }) {
    const apiKey = import.meta.env?.VITE_METEOBLUE_API_KEY;
    if (!this.isEnabled()) {
      throw new Error('Meteoblue API key (VITE_METEOBLUE_API_KEY) is not configured.');
    }

    const url = `https://my.meteoblue.com/packages/basic-day_basic-1h?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&apikey=${apiKey}&format=json&asl=auto&tz=auto`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Meteoblue HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    return this.normalize(data, lat, lon);
  },

  normalize(data, lat, lon) {
    const data1h = data.data_1h || {};
    const dataDay = data.data_day || {};

    // Get current/first hour
    const currentTemp = data1h.temperature ? data1h.temperature[0] : 20;
    const currentPicto = data1h.pictocode ? data1h.pictocode[0] : 1;
    const currentHum = data1h.relativehumidity ? data1h.relativehumidity[0] : 50;
    const currentWind = data1h.windspeed ? data1h.windspeed[0] : 10;
    const currentWindDir = data1h.winddirection ? data1h.winddirection[0] : 0;
    const currentPrecip = data1h.precipitation ? data1h.precipitation[0] : 0;
    const currentApparent = data1h.felttemperature ? data1h.felttemperature[0] : currentTemp;

    const weatherInfo = METEOBLUE_PICTO_MAP[currentPicto] || { condition: 'Clear', icon: '☀️' };

    const tempC = Number(currentTemp.toFixed(1));
    const tempF = Number(((tempC * 9) / 5 + 32).toFixed(1));
    const feelsLike = Number(currentApparent.toFixed(1));

    // Normalize hourly (next 24h)
    const forecastHourly = [];
    const hourlyTimes = data1h.time || [];
    const hourlyTemps = data1h.temperature || [];
    const hourlyPictos = data1h.pictocode || [];

    for (let i = 0; i < Math.min(24, hourlyTimes.length); i++) {
      const pic = hourlyPictos[i] || 1;
      const info = METEOBLUE_PICTO_MAP[pic] || { condition: 'Clear', icon: '☀️' };
      forecastHourly.push({
        time: hourlyTimes[i],
        tempC: Number((hourlyTemps[i] ?? tempC).toFixed(1)),
        condition: info.condition,
        icon: info.icon,
      });
    }

    // Normalize daily (7 days)
    const forecastDaily = [];
    const dailyTimes = dataDay.time || [];
    const dailyMax = dataDay.temperature_max || [];
    const dailyMin = dataDay.temperature_min || [];
    const dailyPictos = dataDay.pictocode || [];

    for (let i = 0; i < dailyTimes.length; i++) {
      const pic = dailyPictos[i] || 1;
      const info = METEOBLUE_PICTO_MAP[pic] || { condition: 'Clear', icon: '☀️' };
      forecastDaily.push({
        date: dailyTimes[i],
        maxTempC: Number((dailyMax[i] ?? tempC).toFixed(1)),
        minTempC: Number((dailyMin[i] ?? tempC).toFixed(1)),
        condition: info.condition,
        icon: info.icon,
      });
    }

    return {
      source: 'Meteoblue',
      sourceId: this.id,
      lat,
      lon,
      tempC,
      tempF,
      feelsLike,
      humidity: Number(currentHum ?? 0),
      windSpeed: Number(currentWind.toFixed(1)),
      windDir: Number(currentWindDir ?? 0),
      precipitation: Number(currentPrecip.toFixed(1)),
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      forecastHourly,
      forecastDaily,
      fetchedAt: new Date().toISOString(),
    };
  },
};

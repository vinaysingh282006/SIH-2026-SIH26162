/**
 * SkyGuard AI — OpenWeatherMap Provider Adapter
 * ==============================================
 * Global meteorological provider via OpenWeatherMap One Call / Current + 5-day Forecast API.
 * Requires VITE_OPENWEATHERMAP_API_KEY.
 */

const OWM_ICON_MAP = {
  '01d': { condition: 'Clear Sky', icon: '☀️' },
  '01n': { condition: 'Clear Sky (Night)', icon: '🌙' },
  '02d': { condition: 'Few Clouds', icon: '🌤️' },
  '02n': { condition: 'Few Clouds (Night)', icon: '☁️' },
  '03d': { condition: 'Scattered Clouds', icon: '⛅' },
  '03n': { condition: 'Scattered Clouds', icon: '⛅' },
  '04d': { condition: 'Overcast Clouds', icon: '☁️' },
  '04n': { condition: 'Overcast Clouds', icon: '☁️' },
  '09d': { condition: 'Shower Rain', icon: '🌧️' },
  '09n': { condition: 'Shower Rain', icon: '🌧️' },
  '10d': { condition: 'Rain', icon: '🌦️' },
  '10n': { condition: 'Rain', icon: '🌧️' },
  '11d': { condition: 'Thunderstorm', icon: '⛈️' },
  '11n': { condition: 'Thunderstorm', icon: '⛈️' },
  '13d': { condition: 'Snow', icon: '❄️' },
  '13n': { condition: 'Snow', icon: '❄️' },
  '50d': { condition: 'Mist / Fog', icon: '🌫️' },
  '50n': { condition: 'Mist / Fog', icon: '🌫️' },
};

export const OpenWeatherMapProvider = {
  id: 'openweathermap',
  name: 'OpenWeatherMap',

  isEnabled() {
    const key = import.meta.env?.VITE_OPENWEATHERMAP_API_KEY;
    return typeof key === 'string' && key.trim().length > 0 && !key.includes('your_');
  },

  async fetchWeather({ lat, lon }) {
    const apiKey = import.meta.env?.VITE_OPENWEATHERMAP_API_KEY;
    if (!this.isEnabled()) {
      throw new Error('OpenWeatherMap API key (VITE_OPENWEATHERMAP_API_KEY) is not configured.');
    }

    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

    // Parallel fetch current and 5-day forecast
    const [currentRes, forecastRes] = await Promise.all([
      fetch(currentUrl, { signal: AbortSignal.timeout(8000) }),
      fetch(forecastUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    ]);

    if (!currentRes.ok) {
      const errText = await currentRes.text().catch(() => '');
      throw new Error(`OpenWeatherMap HTTP ${currentRes.status}: ${errText || currentRes.statusText}`);
    }

    const currentData = await currentRes.json();
    let forecastData = null;
    if (forecastRes && forecastRes.ok) {
      forecastData = await forecastRes.json().catch(() => null);
    }

    return this.normalize(currentData, forecastData, lat, lon);
  },

  normalize(current, forecast, lat, lon) {
    const main = current.main || {};
    const weather = (current.weather && current.weather[0]) || {};
    const wind = current.wind || {};
    const rain = current.rain || {};

    const iconCode = weather.icon || '01d';
    const mapped = OWM_ICON_MAP[iconCode] || {
      condition: weather.main || 'Clear',
      icon: '🌤️',
    };

    const tempC = Number((main.temp ?? 0).toFixed(1));
    const tempF = Number(((tempC * 9) / 5 + 32).toFixed(1));
    const feelsLike = Number((main.feels_like ?? tempC).toFixed(1));
    const windSpeedKmH = Number(((wind.speed ?? 0) * 3.6).toFixed(1)); // m/s to km/h
    const precipitation = Number((rain['1h'] ?? rain['3h'] ?? 0).toFixed(1));

    // Normalize hourly & daily from 5-day/3-hour forecast
    const forecastHourly = [];
    const dailyMap = new Map();

    if (forecast && Array.isArray(forecast.list)) {
      for (const item of forecast.list.slice(0, 16)) {
        const itemWeather = (item.weather && item.weather[0]) || {};
        const itemMapped = OWM_ICON_MAP[itemWeather.icon] || { condition: itemWeather.main || 'Clear', icon: '🌤️' };
        forecastHourly.push({
          time: item.dt_txt || new Date(item.dt * 1000).toISOString(),
          tempC: Number((item.main?.temp ?? 0).toFixed(1)),
          condition: itemMapped.condition,
          icon: itemMapped.icon,
        });
      }

      // Group by date for daily forecast
      for (const item of forecast.list) {
        const dateKey = (item.dt_txt || '').split(' ')[0] || new Date(item.dt * 1000).toISOString().split('T')[0];
        const temp = item.main?.temp ?? 0;
        const itemWeather = (item.weather && item.weather[0]) || {};
        const itemMapped = OWM_ICON_MAP[itemWeather.icon] || { condition: itemWeather.main || 'Clear', icon: '🌤️' };

        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey,
            minTempC: temp,
            maxTempC: temp,
            condition: itemMapped.condition,
            icon: itemMapped.icon,
          });
        } else {
          const entry = dailyMap.get(dateKey);
          entry.minTempC = Math.min(entry.minTempC, temp);
          entry.maxTempC = Math.max(entry.maxTempC, temp);
        }
      }
    }

    const forecastDaily = Array.from(dailyMap.values()).map(d => ({
      ...d,
      minTempC: Number(d.minTempC.toFixed(1)),
      maxTempC: Number(d.maxTempC.toFixed(1)),
    }));

    return {
      source: 'OpenWeatherMap',
      sourceId: this.id,
      lat,
      lon,
      tempC,
      tempF,
      feelsLike,
      humidity: Number(main.humidity ?? 0),
      windSpeed: windSpeedKmH,
      windDir: Number(wind.deg ?? 0),
      precipitation,
      condition: mapped.condition,
      icon: mapped.icon,
      forecastHourly,
      forecastDaily,
      fetchedAt: new Date().toISOString(),
    };
  },
};

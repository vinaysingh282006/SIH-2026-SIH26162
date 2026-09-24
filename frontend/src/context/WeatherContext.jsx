import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchUnifiedWeather, getAvailableProviders } from '../services/weatherProviders/index.js';

const WeatherContext = createContext(null);

export function WeatherProvider({ children }) {
  const [currentCondition, setCurrentCondition] = useState('Clear');
  const [primaryProvider, setPrimaryProvider] = useState('open-meteo');
  const [activeWeather, setActiveWeather] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Available providers metadata
  const availableProviders = getAvailableProviders();

  // Load weather for a coordinate pair
  const loadLocationWeather = useCallback(async (lat, lon, preferredSource = null, bypassCache = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const source = preferredSource || primaryProvider;
      const result = await fetchUnifiedWeather({
        lat,
        lon,
        primarySourceId: source,
        bypassCache,
      });
      setActiveWeather(result);
      if (result.primary?.condition) {
        setCurrentCondition(result.primary.condition);
      }
      return result;
    } catch (err) {
      console.error('[WeatherContext] Failed to fetch weather:', err);
      setError(err.message || 'Failed to retrieve multi-source weather data.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [primaryProvider]);

  return (
    <WeatherContext.Provider
      value={{
        currentCondition,
        setCurrentCondition,
        primaryProvider,
        setPrimaryProvider,
        activeWeather,
        setActiveWeather,
        isLoading,
        error,
        availableProviders,
        loadLocationWeather,
      }}
    >
      {children}
    </WeatherContext.Provider>
  );
}

export function useWeather() {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    throw new Error('useWeather must be used within a WeatherProvider');
  }
  return ctx;
}

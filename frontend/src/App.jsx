import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import TopBar           from './components/TopBar';
import AnimatedBackground from './components/AnimatedBackground';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import Landing          from './pages/Landing';
import LiveMap          from './pages/LiveMap';
import AnomalyFeed      from './pages/AnomalyFeed';
import ExplainDrillDown from './pages/ExplainDrillDown';
import SensorHealth     from './pages/SensorHealth';
import Analytics        from './pages/Analytics';
import Settings         from './pages/Settings';
import DemoMode         from './pages/DemoMode';
import StationDetail    from './pages/StationDetail';
import Roadmap          from './pages/Roadmap';
import { createLiveSocket } from './api/client';
import SystemTourModal from './components/SystemTourModal';
import './App.css';

function AppContent({ anomalyCount }) {
  const { currentCondition } = useWeather();
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setTourOpen(true);
    window.addEventListener('open-system-tour', handleOpen);
    return () => window.removeEventListener('open-system-tour', handleOpen);
  }, []);

  return (
    <div className="app-layout">
      {/* Weather-reactive motion background across entire application */}
      <AnimatedBackground condition={currentCondition} />
      <TopBar anomalyCount={anomalyCount} onOpenTour={() => setTourOpen(true)} />
      <main className="main-content">
        <Routes>
          <Route path="/"                    element={<Landing />} />
          <Route path="/map"                 element={<LiveMap />} />
          <Route path="/stations/:id"        element={<StationDetail />} />
          <Route path="/anomalies"           element={<AnomalyFeed />} />
          <Route path="/anomalies/:id"       element={<ExplainDrillDown />} />
          <Route path="/health"              element={<SensorHealth />} />
          <Route path="/analytics"           element={<Analytics />} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="/demo"                element={<DemoMode />} />
          <Route path="/roadmap"             element={<Roadmap />} />
        </Routes>
      </main>

      {/* Global Interactive System Tour & Stress Test Modal */}
      <SystemTourModal isOpen={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

export default function App() {
  const [anomalyCount, setAnomalyCount] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    wsRef.current = createLiveSocket((event) => {
      if (event.event_type === 'anomaly') {
        setAnomalyCount(c => c + 1);
      }
    });
    return () => wsRef.current?.close();
  }, []);

  return (
    <WeatherProvider>
      <BrowserRouter>
        <AppContent anomalyCount={anomalyCount} />
      </BrowserRouter>
    </WeatherProvider>
  );
}

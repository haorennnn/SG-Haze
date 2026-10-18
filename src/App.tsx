/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRESET_SCENARIOS } from './data/singaporeGeography';
import {
  classifyMonsoonAndPlume,
  degreesToCardinal,
  fetchLiveNeaTelemetry,
} from './services/neaApi';
import {
  getMetricVisualTone,
  interpolate23SingaporeTowns,
  runHoltWindAdvectionEngine,
} from './services/forecastEngine';
import {
  GeminiForecastReport,
  HoltParams,
  HorizonKey,
  NeaDatasetSnapshot,
  RegionKey,
} from './types/haze';
import { TacticalMap } from './components/TacticalMap';
import { HoltTrajectoryChart } from './components/HoltTrajectoryChart';
import { TownIdwGrid } from './components/TownIdwGrid';
import { GeminiForecastPanel } from './components/GeminiForecastPanel';
import {
  Activity,
  Download,
  Gauge,
  Radio,
  RefreshCw,
  RotateCcw,
  Sliders,
  Thermometer,
  Wind,
} from 'lucide-react';

const DEFAULT_HOLT_PARAMS: HoltParams = {
  alpha: 0.62,
  beta: 0.34,
  phi: 0.90,
  advectionWeight: 1.0,
  idwPower: 2.0,
};

const REGION_KEYS: RegionKey[] = ['west', 'south', 'central', 'north', 'east'];

export default function App() {
  // Active dataset (Live NEA v2 by default, or benchmark scenario)
  const [activeMode, setActiveMode] = useState<'live' | 'sw-monsoon-crisis' | 'inter-monsoon-elevated'>('live');
  const [liveSnapshot, setLiveSnapshot] = useState<NeaDatasetSnapshot | null>(null);
  const [isFetchingNea, setIsFetchingNea] = useState<boolean>(true);
  const [neaError, setNeaError] = useState<string | null>(null);

  // Interactive Tactical Map & Horizon State
  const [activeHorizon, setActiveHorizon] = useState<HorizonKey>('NOW');
  const [metricMode, setMetricMode] = useState<'pm25' | 'psi'>('pm25');
  const [selectedTownId, setSelectedTownId] = useState<string>('jurong-east');

  // Holt Linear + Wind Advection Engine Parameters
  const [holtParams, setHoltParams] = useState<HoltParams>(DEFAULT_HOLT_PARAMS);

  // Optional Manual Wind Vector Override for Plume Advection Testing
  const [customWindEnabled, setCustomWindEnabled] = useState<boolean>(false);
  const [customWindDir, setCustomWindDir] = useState<number>(218);
  const [customWindKnots, setCustomWindKnots] = useState<number>(11.5);

  // Gemini AI Forecast State (uses server-side process.env.GEMINI_API_KEY by default)
  const [geminiReport, setGeminiReport] = useState<GeminiForecastReport | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const initialAiTriggered = useRef<boolean>(false);

  // Fetch Live NEA data.gov.sg v2 telemetry
  const loadLiveNeaData = useCallback(async () => {
    setIsFetchingNea(true);
    setNeaError(null);
    try {
      const snap = await fetchLiveNeaTelemetry();
      setLiveSnapshot(snap);
      if (!customWindEnabled) {
        setCustomWindDir(snap.meteorology.windDirectionDeg);
        setCustomWindKnots(snap.meteorology.windSpeedKnots);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reach NEA data.gov.sg v2';
      setNeaError(msg);
    } finally {
      setIsFetchingNea(false);
    }
  }, [customWindEnabled]);

  useEffect(() => {
    loadLiveNeaData();
    // Auto-refresh live NEA telemetry every 5 minutes
    const timer = setInterval(loadLiveNeaData, 300_000);
    return () => clearInterval(timer);
  }, [loadLiveNeaData]);

  // Resolve current active snapshot (Live NEA v2 vs Scenario Preset)
  const currentSnapshot: NeaDatasetSnapshot = useMemo(() => {
    if (activeMode === 'sw-monsoon-crisis') {
      return PRESET_SCENARIOS['sw-monsoon-crisis'];
    }
    if (activeMode === 'inter-monsoon-elevated') {
      return PRESET_SCENARIOS['inter-monsoon-elevated'];
    }
    return liveSnapshot || PRESET_SCENARIOS['inter-monsoon-elevated'];
  }, [activeMode, liveSnapshot]);

  // Apply custom wind vector override if enabled
  const effectiveMeteorology = useMemo(() => {
    if (!customWindEnabled) {
      return currentSnapshot.meteorology;
    }
    const { monsoonRegime, plumeVectorLabel, transboundaryRiskFactor } =
      classifyMonsoonAndPlume(customWindDir);
    return {
      ...currentSnapshot.meteorology,
      windDirectionDeg: customWindDir,
      windCardinal: degreesToCardinal(customWindDir),
      windSpeedKnots: customWindKnots,
      windSpeedMs: Number((customWindKnots * 0.514444).toFixed(2)),
      monsoonRegime,
      plumeVectorLabel,
      transboundaryRiskFactor,
    };
  }, [currentSnapshot.meteorology, customWindEnabled, customWindDir, customWindKnots]);

  // Run Holt Linear + Wind Advection Forecast Engine (+1h, +3h, +6h, +12h, +24h)
  const { horizonForecasts, hourlyTrajectory } = useMemo(() => {
    return runHoltWindAdvectionEngine(
      currentSnapshot.regions,
      effectiveMeteorology,
      holtParams
    );
  }, [currentSnapshot.regions, effectiveMeteorology, holtParams]);

  // Run 23-Town Inverse Distance Weighting (IDW) Spatial Interpolation across all horizons
  const interpolated23Towns = useMemo(() => {
    return interpolate23SingaporeTowns(horizonForecasts, holtParams.idwPower);
  }, [horizonForecasts, holtParams.idwPower]);

  const selectedTown = useMemo(
    () => interpolated23Towns.find((t) => t.id === selectedTownId) || interpolated23Towns[0],
    [interpolated23Towns, selectedTownId]
  );

  // Trigger Server-Side Gemini AI Forecast (uses process.env.GEMINI_API_KEY via @google/genai gemini-2.5-flash)
  const runGeminiForecast = useCallback(async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const compactRegions = Object.fromEntries(
        REGION_KEYS.map((k) => [
          k,
          {
            pm25: currentSnapshot.regions[k].pm25,
            psi24h: currentSnapshot.regions[k].psi24h,
            pm10SubIndex: currentSnapshot.regions[k].pm10SubIndex,
            o3SubIndex: currentSnapshot.regions[k].o3SubIndex,
          },
        ])
      );

      const compactForecasts = Object.fromEntries(
        (['+1h', '+3h', '+6h', '+12h', '+24h'] as HorizonKey[]).map((hKey) => [
          hKey,
          {
            islandAvgPm25: horizonForecasts[hKey].islandAvgPm25,
            islandMaxPm25: horizonForecasts[hKey].islandMaxPm25,
            islandAvgPsi: horizonForecasts[hKey].islandAvgPsi,
            islandMaxPsi: horizonForecasts[hKey].islandMaxPsi,
            regions: Object.fromEntries(
              REGION_KEYS.map((rKey) => [
                rKey,
                {
                  pm25: horizonForecasts[hKey].regions[rKey].pm25,
                  psi24h: horizonForecasts[hKey].regions[rKey].psi24h,
                },
              ])
            ),
          },
        ])
      );

      const compactTowns = interpolated23Towns.map((t) => ({
        name: t.name,
        region: t.regionGroup,
        nowPm25: t.horizons.NOW.pm25,
        nowPsi: t.horizons.NOW.psi,
        plus6hPm25: t.horizons['+6h'].pm25,
        plus24hPm25: t.horizons['+24h'].pm25,
      }));

      const response = await fetch('/api/gemini-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: currentSnapshot.timestamp,
          scenarioLabel: currentSnapshot.scenarioLabel,
          selectedTown: selectedTown?.name || 'Jurong / Boon Lay',
          holtParams,
          regions: compactRegions,
          meteorology: {
            windSpeedKnots: effectiveMeteorology.windSpeedKnots,
            windDirectionDeg: effectiveMeteorology.windDirectionDeg,
            windCardinal: effectiveMeteorology.windCardinal,
            temperatureC: effectiveMeteorology.temperatureC,
            humidityPct: effectiveMeteorology.humidityPct,
            monsoonRegime: effectiveMeteorology.monsoonRegime,
            plumeVectorLabel: effectiveMeteorology.plumeVectorLabel,
            generalForecast: effectiveMeteorology.generalForecast,
          },
          forecasts: compactForecasts,
          towns: compactTowns,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setGeminiReport(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate AI forecast';
      setAiError(msg);
    } finally {
      setIsGeneratingAi(false);
    }
  }, [
    currentSnapshot,
    effectiveMeteorology,
    holtParams,
    horizonForecasts,
    interpolated23Towns,
    selectedTown,
  ]);

  // Automatically trigger Gemini AI Forecast once initial NEA telemetry is ready
  useEffect(() => {
    if (!isFetchingNea && !initialAiTriggered.current) {
      initialAiTriggered.current = true;
      runGeminiForecast();
    }
  }, [isFetchingNea, runGeminiForecast]);

  // Export CSV snapshot of all 23 Singapore Towns IDW + Multi-Horizon Forecasts
  const handleExportCsv = () => {
    const headers = [
      'Town_Index',
      'Town_Name',
      'Sector',
      'Latitude',
      'Longitude',
      'Nearest_NEA_Region',
      'NOW_PM25',
      'NOW_PSI',
      'Plus1h_PM25',
      'Plus3h_PM25',
      'Plus6h_PM25',
      'Plus12h_PM25',
      'Plus24h_PM25',
      'Plus24h_PSI',
    ];
    const rows = interpolated23Towns.map((t) => [
      t.index,
      `"${t.name}"`,
      t.regionGroup,
      t.lat,
      t.lng,
      t.nearestRegion.toUpperCase(),
      t.horizons.NOW.pm25,
      t.horizons.NOW.psi,
      t.horizons['+1h'].pm25,
      t.horizons['+3h'].pm25,
      t.horizons['+6h'].pm25,
      t.horizons['+12h'].pm25,
      t.horizons['+24h'].pm25,
      t.horizons['+24h'].psi,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sg_haze_23towns_idw_${new Date().toISOString().slice(0, 16)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeHorizonData = horizonForecasts[activeHorizon];
  const peakPm25Tone = getMetricVisualTone(activeHorizonData.islandMaxPm25, 'pm25');
  const peakPsiTone = getMetricVisualTone(activeHorizonData.islandMaxPsi, 'psi');

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: [Brand title, one line] — [4 nav links, single-line] — [1 primary action] */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0B0E17]">
        <a
          href="#top"
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          Singapore Haze Command Center
        </a>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a
            href="#tactical-map"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Tactical Map
          </a>
          <a
            href="#holt-engine"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Holt Forecast
          </a>
          <a
            href="#gemini-briefing"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            AI Briefing
          </a>
          <a
            href="#town-idw-grid"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            23-Town IDW Grid
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 text-xs font-mono font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export 23-Town CSV
          </button>
        </div>
      </header>

      {/* Sub-Header Telemetry Ribbon */}
      <div className="bg-[#0A0D16] border-b border-slate-800/80 px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3 text-slate-400">
          <span className="text-cyan-400 font-semibold">
            {currentSnapshot.source === 'NEA_V2_LIVE'
              ? '● NEA DATA.GOV.SG V2 LIVE FEED'
              : currentSnapshot.source === 'NEA_V1_LIVE'
              ? '● NEA DATA.GOV.SG V1 FALLBACK'
              : '◆ CALIBRATED TRANSIENT PLUME BENCHMARK'}
          </span>
          <span>·</span>
          <span className="tabular-nums">
            OBS: {new Date(currentSnapshot.timestamp).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} SGT
          </span>
          <span>·</span>
          <span className="tabular-nums">
            API LATENCY: {currentSnapshot.apiLatencyMs} ms
          </span>
        </div>

        {/* Feed / Scenario Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#07090E] p-0.5 border border-slate-800 rounded">
            <button
              type="button"
              onClick={() => {
                setActiveMode('live');
                setCustomWindEnabled(false);
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                activeMode === 'live'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live NEA v2 API
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('inter-monsoon-elevated');
                setCustomWindEnabled(false);
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                activeMode === 'inter-monsoon-elevated'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SE Plume Watch
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('sw-monsoon-crisis');
                setCustomWindEnabled(false);
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                activeMode === 'sw-monsoon-crisis'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SW Sumatra Crisis
            </button>
          </div>

          <button
            type="button"
            onClick={loadLiveNeaData}
            disabled={isFetchingNea}
            className="px-2.5 py-1 text-xs font-mono bg-[#07090E] border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center gap-1.5 rounded whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-400 ${isFetchingNea ? 'animate-spin' : ''}`} />
            Sync NEA v2
          </button>
        </div>
      </div>

      {neaError && (
        <div className="px-6 py-2 bg-amber-950/30 border-b border-amber-500/30 text-xs font-mono text-amber-300">
          Notice: {neaError} — operating with cached NEA regional telemetry.
        </div>
      )}

      {/* Main Asymmetric Split Console Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT CONTROL & TELEMETRY COLUMN (3 cols on xl) */}
        <aside className="xl:col-span-3 space-y-5">
          {/* Panel 1: 5 NEA Regional Reference Stations */}
          <div className="bg-[#0B0E17] border border-slate-800">
            <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0F1420] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold tracking-wider text-slate-200">
                  5 NEA REGIONAL ANCHORS ({activeHorizon})
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                PM2.5 / PSI
              </span>
            </div>

            <div className="divide-y divide-slate-800/70">
              {REGION_KEYS.map((rKey) => {
                const regBase = currentSnapshot.regions[rKey];
                const regHorizon = activeHorizonData.regions[rKey];
                const pmTone = getMetricVisualTone(regHorizon.pm25, 'pm25');
                const psiTone = getMetricVisualTone(regHorizon.psi24h, 'psi');
                const deltaPm25 = regHorizon.pm25 - regBase.pm25;

                return (
                  <div key={rKey} className="p-3 hover:bg-slate-900/40 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-xs font-bold text-slate-100 uppercase font-mono">
                          {regBase.label}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {regBase.stationName}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="flex items-baseline justify-end gap-2">
                          <span className={`text-lg font-bold ${pmTone.textClass}`}>
                            {regHorizon.pm25}
                          </span>
                          <span className="text-[10px] text-slate-400">µg/m³</span>
                          <span className="text-slate-600">/</span>
                          <span className={`text-sm font-semibold ${psiTone.textClass}`}>
                            {regHorizon.psi24h}
                          </span>
                          <span className="text-[10px] text-slate-400">PSI</span>
                        </div>
                        {activeHorizon !== 'NOW' && (
                          <div className="text-[10px] text-slate-400">
                            Δ {deltaPm25 >= 0 ? `+${deltaPm25}` : deltaPm25} µg/m³ (Holt{' '}
                            {regHorizon.holtTrendComponent >= 0
                              ? `+${regHorizon.holtTrendComponent}`
                              : regHorizon.holtTrendComponent}
                            , Adv{' '}
                            {regHorizon.windAdvectionDelta >= 0
                              ? `+${regHorizon.windAdvectionDelta}`
                              : regHorizon.windAdvectionDelta}
                            )
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pollutant Sub-Indices Bar */}
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                      <span>PM10: {regBase.pm10SubIndex}</span>
                      <span>O₃: {regBase.o3SubIndex}</span>
                      <span>NO₂: {regBase.no2SubIndex}</span>
                      <span>SO₂: {regBase.so2SubIndex}</span>
                      <span>CO: {regBase.coSubIndex}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel 2: Meteorological & Wind Advection Vector Controls */}
          <div className="bg-[#0B0E17] border border-slate-800">
            <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0F1420] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold tracking-wider text-slate-200">
                  WIND ADVECTION & METEOROLOGY
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomWindEnabled((v) => !v)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                  customWindEnabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-[#07090E] text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {customWindEnabled ? 'Manual Vector' : 'NEA Live Vector'}
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#07090E] border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-400">WIND BEARING</div>
                  <div className="text-base font-bold text-slate-100 tabular-nums mt-0.5">
                    {effectiveMeteorology.windDirectionDeg}° {effectiveMeteorology.windCardinal}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-400">WIND SPEED</div>
                  <div className="text-base font-bold text-slate-100 tabular-nums mt-0.5">
                    {effectiveMeteorology.windSpeedKnots} kt
                    <span className="text-[11px] font-normal text-slate-400 ml-1">
                      ({effectiveMeteorology.windSpeedMs} m/s)
                    </span>
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-cyan-400" /> AIR TEMP
                  </div>
                  <div className="text-base font-bold text-slate-100 tabular-nums mt-0.5">
                    {effectiveMeteorology.temperatureC}°C
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-400">REL. HUMIDITY</div>
                  <div className="text-base font-bold text-slate-100 tabular-nums mt-0.5">
                    {effectiveMeteorology.humidityPct}%
                  </div>
                </div>
              </div>

              <div className="bg-[#07090E] border border-slate-800 p-2.5 space-y-1">
                <div className="text-[10px] text-slate-400">MONSOON & PLUME SOURCE VECTOR</div>
                <div className="text-cyan-400 font-semibold">
                  {effectiveMeteorology.monsoonRegime}
                </div>
                <div className="text-slate-300 text-[11px]">
                  {effectiveMeteorology.plumeVectorLabel}
                </div>
              </div>

              {/* Interactive Wind Bearing & Speed Sliders */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">SIMULATE WIND DIRECTION (FROM)</span>
                    <span className="text-cyan-400 tabular-nums">
                      {customWindDir}° ({degreesToCardinal(customWindDir)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={customWindDir}
                    onChange={(e) => {
                      setCustomWindEnabled(true);
                      setCustomWindDir(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">SIMULATE WIND SPEED</span>
                    <span className="text-cyan-400 tabular-nums">
                      {customWindKnots.toFixed(1)} knots
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={26}
                    step={0.5}
                    value={customWindKnots}
                    onChange={(e) => {
                      setCustomWindEnabled(true);
                      setCustomWindKnots(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3: Holt Linear + IDW Engine Calibration */}
          <div className="bg-[#0B0E17] border border-slate-800">
            <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0F1420] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold tracking-wider text-slate-200">
                  HOLT + IDW MODEL CALIBRATION
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHoltParams(DEFAULT_HOLT_PARAMS)}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                title="Reset to NEA Calibrated Defaults"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs font-mono">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">LEVEL SMOOTHING (α)</span>
                  <span className="text-cyan-400 tabular-nums">{holtParams.alpha.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={0.95}
                  step={0.01}
                  value={holtParams.alpha}
                  onChange={(e) =>
                    setHoltParams((p) => ({ ...p, alpha: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">TREND SMOOTHING (β)</span>
                  <span className="text-cyan-400 tabular-nums">{holtParams.beta.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.85}
                  step={0.01}
                  value={holtParams.beta}
                  onChange={(e) =>
                    setHoltParams((p) => ({ ...p, beta: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">HORIZON DAMPING (ϕ)</span>
                  <span className="text-cyan-400 tabular-nums">{holtParams.phi.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.70}
                  max={0.98}
                  step={0.01}
                  value={holtParams.phi}
                  onChange={(e) =>
                    setHoltParams((p) => ({ ...p, phi: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">WIND ADVECTION GAIN</span>
                  <span className="text-cyan-400 tabular-nums">
                    {holtParams.advectionWeight.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2.0}
                  step={0.05}
                  value={holtParams.advectionWeight}
                  onChange={(e) =>
                    setHoltParams((p) => ({ ...p, advectionWeight: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">23-TOWN IDW POWER (p)</span>
                  <span className="text-cyan-400 tabular-nums">
                    p = {holtParams.idwPower.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={3.5}
                  step={0.1}
                  value={holtParams.idwPower}
                  onChange={(e) =>
                    setHoltParams((p) => ({ ...p, idwPower: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN STAGE VIEWPORT (9 cols on xl) */}
        <section className="xl:col-span-9 space-y-5">
          {/* 4-Card Primary Telemetry KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* KPI 1: Peak 1-Hr PM2.5 */}
            <div className="bg-[#0B0E17] border border-slate-800 p-4">
              <div className="text-xs font-mono tracking-wider text-slate-400 uppercase">
                PEAK 1-HR PM2.5 ({activeHorizon})
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className={`text-3xl font-mono font-bold tabular-nums ${peakPm25Tone.textClass}`}>
                  {activeHorizonData.islandMaxPm25}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1.5">
                  µg/m³
                </span>
              </div>
              <div className={`mt-1 text-xs font-mono ${peakPm25Tone.textClass}`}>
                {peakPm25Tone.glyph} Band: {peakPm25Tone.descriptor} · Mean {activeHorizonData.islandAvgPm25} µg/m³
              </div>
            </div>

            {/* KPI 2: Peak 24-Hr PSI */}
            <div className="bg-[#0B0E17] border border-slate-800 p-4">
              <div className="text-xs font-mono tracking-wider text-slate-400 uppercase">
                PEAK 24-HR PSI ({activeHorizon})
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className={`text-3xl font-mono font-bold tabular-nums ${peakPsiTone.textClass}`}>
                  {activeHorizonData.islandMaxPsi}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1.5">
                  PSI
                </span>
              </div>
              <div className={`mt-1 text-xs font-mono ${peakPsiTone.textClass}`}>
                {peakPsiTone.glyph} {peakPsiTone.descriptor} · Island Mean {activeHorizonData.islandAvgPsi} PSI
              </div>
            </div>

            {/* KPI 3: +6H / +24H Forecast Trajectory */}
            <div className="bg-[#0B0E17] border border-slate-800 p-4">
              <div className="text-xs font-mono tracking-wider text-slate-400 uppercase">
                HOLT + ADVECTION OUTLOOK
              </div>
              <div className="mt-1.5 flex items-baseline gap-3 font-mono tabular-nums">
                <div>
                  <span className="text-xs text-slate-400">+6h: </span>
                  <span className="text-2xl font-bold text-cyan-400">
                    {horizonForecasts['+6h'].islandMaxPm25}
                  </span>
                </div>
                <span className="text-slate-600">/</span>
                <div>
                  <span className="text-xs text-slate-400">+24h: </span>
                  <span className="text-2xl font-bold text-slate-100">
                    {horizonForecasts['+24h'].islandMaxPm25}
                  </span>
                </div>
                <span className="text-xs text-slate-400">µg/m³</span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-400 truncate">
                {effectiveMeteorology.windCardinal} {effectiveMeteorology.windSpeedKnots} kt · Risk {(effectiveMeteorology.transboundaryRiskFactor * 100).toFixed(0)}%
              </div>
            </div>

            {/* KPI 4: Selected Singapore Town IDW Probe */}
            <div className="bg-[#0B0E17] border border-slate-800 p-4">
              <div className="text-xs font-mono tracking-wider text-slate-400 uppercase truncate">
                TOWN IDW: {selectedTown.name.toUpperCase()}
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-mono font-bold tabular-nums text-cyan-300">
                  {selectedTown.horizons[activeHorizon].pm25}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1.5">
                  µg/m³
                </span>
                <span className="text-slate-600 mx-2">·</span>
                <span className="text-lg font-mono font-semibold tabular-nums text-slate-200">
                  {selectedTown.horizons[activeHorizon].psi}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">
                  PSI
                </span>
              </div>
              <div className="mt-1 text-xs font-mono text-slate-400">
                +6h: {selectedTown.horizons['+6h'].pm25} µg/m³ · +24h: {selectedTown.horizons['+24h'].pm25} µg/m³
              </div>
            </div>
          </div>

          {/* Section 1: Tactical SVG Map of Singapore */}
          <div id="tactical-map">
            <TacticalMap
              activeHorizon={activeHorizon}
              onSelectHorizon={setActiveHorizon}
              metricMode={metricMode}
              onToggleMetricMode={setMetricMode}
              horizonForecast={activeHorizonData}
              towns={interpolated23Towns}
              selectedTownId={selectedTownId}
              onSelectTown={setSelectedTownId}
              meteorology={effectiveMeteorology}
            />
          </div>

          {/* Section 2: +1h/+3h/+6h/+12h/+24h Holt Linear + Wind Advection Forecast Engine */}
          <div id="holt-engine">
            <HoltTrajectoryChart
              hourlyTrajectory={hourlyTrajectory}
              horizonForecasts={horizonForecasts}
              metricMode={metricMode}
              activeHorizon={activeHorizon}
              onSelectHorizon={setActiveHorizon}
            />
          </div>

          {/* Section 3: Gemini AI Forecast Briefing (Server-side process.env.GEMINI_API_KEY via @google/genai) */}
          <div id="gemini-briefing">
            <GeminiForecastPanel
              report={geminiReport}
              isLoading={isGeneratingAi}
              error={aiError}
              onGenerate={runGeminiForecast}
              selectedTownName={selectedTown.name}
            />
          </div>

          {/* Section 4: All 23 Singapore Towns IDW Spatial Interpolation Grid */}
          <div id="town-idw-grid">
            <TownIdwGrid
              towns={interpolated23Towns}
              selectedTownId={selectedTownId}
              onSelectTown={setSelectedTownId}
              activeHorizon={activeHorizon}
              metricMode={metricMode}
              idwPower={holtParams.idwPower}
            />
          </div>
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0B0E17] px-6 py-4 mt-8 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          Singapore Haze Command Center · National Environment Agency (NEA) data.gov.sg v2 Real-Time APIs
        </div>
        <div className="font-mono">
          23-Town IDW Spatial Interpolation · Damped Holt Linear + Wind Advection Forecast Engine (+1h to +24h)
        </div>
      </footer>
    </div>
  );
}

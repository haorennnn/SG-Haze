import React, { useMemo, useState } from 'react';
import {
  CENTRAL_CATCHMENT_COORDS,
  coordsToSvgPath,
  JURONG_ISLAND_COORDS,
  NEA_REGIONS,
  projectLatLngToSvg,
  PULAU_TEKONG_COORDS,
  PULAU_UBIN_COORDS,
  SENTOSA_COORDS,
  SG_BOUNDS,
  SINGAPORE_MAINLAND_COORDS,
  unprojectSvgToLatLng,
} from '../data/singaporeGeography';
import { getMetricVisualTone } from '../services/forecastEngine';
import {
  HorizonKey,
  MeteorologyState,
  RegionHorizonForecast,
  RegionKey,
  TownInterpolated,
} from '../types/haze';
import { Compass, Crosshair, Layers, Maximize2, Wind } from 'lucide-react';

interface TacticalMapProps {
  activeHorizon: HorizonKey;
  onSelectHorizon: (h: HorizonKey) => void;
  metricMode: 'pm25' | 'psi';
  onToggleMetricMode: (m: 'pm25' | 'psi') => void;
  horizonForecast: RegionHorizonForecast;
  towns: TownInterpolated[];
  selectedTownId: string;
  onSelectTown: (id: string) => void;
  meteorology: MeteorologyState;
}

const REGION_KEYS: RegionKey[] = ['north', 'south', 'east', 'west', 'central'];

export const TacticalMap: React.FC<TacticalMapProps> = ({
  activeHorizon,
  onSelectHorizon,
  metricMode,
  onToggleMetricMode,
  horizonForecast,
  towns,
  selectedTownId,
  onSelectTown,
  meteorology,
}) => {
  const [showContours, setShowContours] = useState(true);
  const [showWindVectors, setShowWindVectors] = useState(true);
  const [showAllTownLabels, setShowAllTownLabels] = useState(true);
  const [zoom, setZoom] = useState<number>(1);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>({
    lat: 1.3526,
    lng: 103.8352,
  });

  const mainlandPath = useMemo(() => coordsToSvgPath(SINGAPORE_MAINLAND_COORDS), []);
  const jurongIslandPath = useMemo(() => coordsToSvgPath(JURONG_ISLAND_COORDS), []);
  const sentosaPath = useMemo(() => coordsToSvgPath(SENTOSA_COORDS), []);
  const ubinPath = useMemo(() => coordsToSvgPath(PULAU_UBIN_COORDS), []);
  const tekongPath = useMemo(() => coordsToSvgPath(PULAU_TEKONG_COORDS), []);
  const catchmentPath = useMemo(() => coordsToSvgPath(CENTRAL_CATCHMENT_COORDS), []);

  // Graticule lines
  const latLines = [1.25, 1.30, 1.35, 1.40, 1.45];
  const lngLines = [103.65, 103.75, 103.85, 103.95, 104.03];

  // Wind propagation angle in SVG screen coordinates
  // Meteorological windDirectionDeg is where wind blows FROM (0=N, 90=E, 180=S, 270=W)
  // Propagation direction (where wind blows TO) is (windDirectionDeg + 180) % 360
  const windToDeg = (meteorology.windDirectionDeg + 180) % 360;
  const windToRad = (windToDeg * Math.PI) / 180;
  const dxWind = Math.sin(windToRad);
  const dyWind = -Math.cos(windToRad); // In SVG, North is -Y

  // Generate grid of wind streamlines across the tactical viewport
  const windStreamlines = useMemo(() => {
    const lines: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      headX1: number;
      headY1: number;
      headX2: number;
      headY2: number;
    }> = [];
    const arrowLen = Math.min(54, Math.max(24, meteorology.windSpeedKnots * 3.6));
    const cols = 7;
    const rows = 4;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = 105 + c * 125 + (r % 2 === 0 ? 0 : 35);
        const cy = 85 + r * 115;
        const x1 = cx - (dxWind * arrowLen) / 2;
        const y1 = cy - (dyWind * arrowLen) / 2;
        const x2 = cx + (dxWind * arrowLen) / 2;
        const y2 = cy + (dyWind * arrowLen) / 2;

        // Arrowhead wings
        const wingLen = 7;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headX1 = x2 - wingLen * Math.cos(angle - Math.PI / 6);
        const headY1 = y2 - wingLen * Math.sin(angle - Math.PI / 6);
        const headX2 = x2 - wingLen * Math.cos(angle + Math.PI / 6);
        const headY2 = y2 - wingLen * Math.sin(angle + Math.PI / 6);

        lines.push({
          id: `ws-${r}-${c}`,
          x1,
          y1,
          x2,
          y2,
          headX1,
          headY1,
          headX2,
          headY2,
        });
      }
    }
    return lines;
  }, [dxWind, dyWind, meteorology.windSpeedKnots]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * SG_BOUNDS.svgWidth;
    const svgY = ((e.clientY - rect.top) / rect.height) * SG_BOUNDS.svgHeight;
    setCursorCoords(unprojectSvgToLatLng(svgX, svgY));
  };

  // Compute dynamic SVG viewBox for zoom centered on Singapore
  const viewBox = useMemo(() => {
    const w = SG_BOUNDS.svgWidth / zoom;
    const h = SG_BOUNDS.svgHeight / zoom;
    const x = (SG_BOUNDS.svgWidth - w) / 2;
    const y = (SG_BOUNDS.svgHeight - h) / 2;
    return `${x} ${y} ${w} ${h}`;
  }, [zoom]);

  return (
    <div className="bg-[#0B0E17] border border-slate-800 flex flex-col">
      {/* Map Instrument Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0F1420]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold tracking-wider text-slate-200 whitespace-nowrap">
              TACTICAL SPATIAL INTERPOLATION STAGE (23 TOWNS · 5 NEA ANCHORS)
            </span>
          </div>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-xs font-mono tabular-nums text-cyan-400 hidden sm:inline">
            HORIZON: {activeHorizon}
          </span>
        </div>

        {/* Layer & Metric Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Mode Selector */}
          <div className="flex items-center bg-[#07090E] p-0.5 border border-slate-800 rounded">
            <button
              type="button"
              onClick={() => onToggleMetricMode('pm25')}
              className={`px-2.5 py-1 text-xs font-mono transition-colors whitespace-nowrap shrink-0 rounded-xs ${
                metricMode === 'pm25'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1-HR PM2.5 (µg/m³)
            </button>
            <button
              type="button"
              onClick={() => onToggleMetricMode('psi')}
              className={`px-2.5 py-1 text-xs font-mono transition-colors whitespace-nowrap shrink-0 rounded-xs ${
                metricMode === 'psi'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              24-HR PSI
            </button>
          </div>

          {/* Layer Toggles */}
          <button
            type="button"
            onClick={() => setShowContours((v) => !v)}
            className={`px-2.5 py-1 text-xs font-mono border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded ${
              showContours
                ? 'bg-slate-800/90 text-slate-200 border-slate-600'
                : 'bg-[#07090E] text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            IDW Contours
          </button>

          <button
            type="button"
            onClick={() => setShowWindVectors((v) => !v)}
            className={`px-2.5 py-1 text-xs font-mono border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded ${
              showWindVectors
                ? 'bg-slate-800/90 text-slate-200 border-slate-600'
                : 'bg-[#07090E] text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-cyan-400" />
            Wind Vectors
          </button>

          <button
            type="button"
            onClick={() => setShowAllTownLabels((v) => !v)}
            className={`px-2.5 py-1 text-xs font-mono border transition-colors whitespace-nowrap shrink-0 rounded ${
              showAllTownLabels
                ? 'bg-slate-800/90 text-slate-200 border-slate-600'
                : 'bg-[#07090E] text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            23 Town Callouts
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => (z >= 1.5 ? 1 : Number((z + 0.25).toFixed(2))))}
            className="px-2.5 py-1 text-xs font-mono bg-[#07090E] text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 rounded"
            title="Cycle Tactical Zoom"
          >
            <Maximize2 className="w-3 h-3 text-cyan-400" />
            {zoom.toFixed(2)}x
          </button>
        </div>
      </div>

      {/* Main SVG Tactical Viewport */}
      <div className="relative w-full aspect-[16/9] min-h-[390px] bg-[#060911] overflow-hidden select-none">
        <svg
          viewBox={viewBox}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
        >
          <defs>
            {/* Dynamic Radial Gradients for the 5 NEA Regions (IDW Field Plume Contours) */}
            {REGION_KEYS.map((rKey) => {
              const regData = horizonForecast.regions[rKey];
              const val = metricMode === 'pm25' ? regData.pm25 : regData.psi24h;
              const tone = getMetricVisualTone(val, metricMode);
              return (
                <radialGradient key={`grad-${rKey}`} id={`idw-halo-${rKey}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={tone.hex} stopOpacity="0.34" />
                  <stop offset="45%" stopColor={tone.hex} stopOpacity="0.14" />
                  <stop offset="100%" stopColor={tone.hex} stopOpacity="0" />
                </radialGradient>
              );
            })}

            {/* Subtle bathymetry / maritime grid pattern */}
            <pattern id="tactical-subgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="#0F172A"
                strokeWidth="0.6"
              />
            </pattern>
          </defs>

          {/* Background Tactical Grid */}
          <rect x="0" y="0" width={SG_BOUNDS.svgWidth} height={SG_BOUNDS.svgHeight} fill="url(#tactical-subgrid)" />

          {/* Coordinate Graticule Lines */}
          {latLines.map((lat) => {
            const { y } = projectLatLngToSvg(lat, SG_BOUNDS.minLng);
            return (
              <g key={`lat-${lat}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={SG_BOUNDS.svgWidth}
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth="0.75"
                  strokeDasharray="3 5"
                />
                <text
                  x={10}
                  y={y - 4}
                  fill="#475569"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {lat.toFixed(2)}°N
                </text>
              </g>
            );
          })}

          {lngLines.map((lng) => {
            const { x } = projectLatLngToSvg(SG_BOUNDS.minLat, lng);
            return (
              <g key={`lng-${lng}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={SG_BOUNDS.svgHeight}
                  stroke="#1E293B"
                  strokeWidth="0.75"
                  strokeDasharray="3 5"
                />
                <text
                  x={x + 4}
                  y={SG_BOUNDS.svgHeight - 8}
                  fill="#475569"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {lng.toFixed(2)}°E
                </text>
              </g>
            );
          })}

          {/* Surrounding Regional Geography Labels (Strait of Johor & Singapore Strait) */}
          <text
            x={360}
            y={24}
            fill="#334155"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
          >
            STRAITS OF JOHOR · PENINSULAR MALAYSIA
          </text>
          <text
            x={375}
            y={518}
            fill="#334155"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
          >
            SINGAPORE STRAIT · RIAU ARCHIPELAGO (SUMATRA VECTOR)
          </text>

          {/* Singapore Landmass Polygons */}
          <g>
            {/* Mainland Singapore */}
            <path
              d={mainlandPath}
              fill="#111827"
              stroke="#334155"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* Central Water Catchment Nature Reserve */}
            <path
              d={catchmentPath}
              fill="#0D1524"
              stroke="#1E293B"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            {/* Offshore Islands */}
            <path d={jurongIslandPath} fill="#111827" stroke="#334155" strokeWidth="1.2" />
            <path d={sentosaPath} fill="#111827" stroke="#334155" strokeWidth="1.2" />
            <path d={ubinPath} fill="#111827" stroke="#334155" strokeWidth="1.2" />
            <path d={tekongPath} fill="#111827" stroke="#334155" strokeWidth="1.2" />
          </g>

          {/* Layer 1: IDW Radial Plume Contours */}
          {showContours &&
            REGION_KEYS.map((rKey) => {
              const coord = NEA_REGIONS[rKey];
              const pt = projectLatLngToSvg(coord.lat, coord.lng);
              return (
                <circle
                  key={`contour-${rKey}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={185}
                  fill={`url(#idw-halo-${rKey})`}
                  pointerEvents="none"
                />
              );
            })}

          {/* Layer 2: Wind Advection Streamlines */}
          {showWindVectors && (
            <g opacity="0.58" pointerEvents="none">
              {windStreamlines.map((line) => (
                <g key={line.id}>
                  <line
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#06B6D4"
                    strokeWidth="1.15"
                    strokeDasharray="3 2"
                  />
                  <polyline
                    points={`${line.headX1},${line.headY1} ${line.x2},${line.y2} ${line.headX2},${line.headY2}`}
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="1.25"
                  />
                </g>
              ))}
            </g>
          )}

          {/* Layer 3: Inter-station IDW Spider Links for the Selected Town */}
          {(() => {
            const activeTown = towns.find((t) => t.id === selectedTownId);
            if (!activeTown) return null;
            const townPt = projectLatLngToSvg(activeTown.lat, activeTown.lng);
            return (
              <g pointerEvents="none">
                {REGION_KEYS.map((rKey) => {
                  const regCoord = NEA_REGIONS[rKey];
                  const regPt = projectLatLngToSvg(regCoord.lat, regCoord.lng);
                  const w = activeTown.weights[rKey];
                  return (
                    <g key={`idw-link-${rKey}`}>
                      <line
                        x1={townPt.x}
                        y1={townPt.y}
                        x2={regPt.x}
                        y2={regPt.y}
                        stroke="#22D3EE"
                        strokeWidth={Math.max(0.6, w * 4.5)}
                        strokeOpacity={Math.max(0.2, w * 1.1)}
                        strokeDasharray="2 3"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Layer 4: 5 NEA Regional Reference Stations */}
          {REGION_KEYS.map((rKey) => {
            const regMeta = NEA_REGIONS[rKey];
            const regMetrics = horizonForecast.regions[rKey];
            const pt = projectLatLngToSvg(regMeta.lat, regMeta.lng);
            const val = metricMode === 'pm25' ? regMetrics.pm25 : regMetrics.psi24h;
            const tone = getMetricVisualTone(val, metricMode);

            return (
              <g key={`nea-anchor-${rKey}`} transform={`translate(${pt.x}, ${pt.y})`}>
                {/* Outer calibration ring */}
                <circle
                  r="19"
                  fill="#07090E"
                  fillOpacity="0.82"
                  stroke={tone.hex}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                {/* Inner station badge */}
                <rect
                  x="-26"
                  y="-11"
                  width="52"
                  height="22"
                  rx="3"
                  fill="#07090E"
                  stroke={tone.hex}
                  strokeWidth="1.5"
                />
                <text
                  x="0"
                  y="-1"
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  NEA·{rKey.toUpperCase().slice(0, 3)}
                </text>
                <text
                  x="0"
                  y="8.5"
                  textAnchor="middle"
                  fill={tone.hex}
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Layer 5: All 23 Singapore Towns (IDW Interpolated Nodes) */}
          {towns.map((town) => {
            const pt = projectLatLngToSvg(town.lat, town.lng);
            const hData = town.horizons[activeHorizon];
            const val = metricMode === 'pm25' ? hData.pm25 : hData.psi;
            const tone = getMetricVisualTone(val, metricMode);
            const isSelected = town.id === selectedTownId;

            return (
              <g
                key={town.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                onClick={() => onSelectTown(town.id)}
                className="cursor-pointer group"
              >
                {/* Selection reticle */}
                {isSelected && (
                  <>
                    <circle
                      r="14"
                      fill="none"
                      stroke="#22D3EE"
                      strokeWidth="1.5"
                    />
                    <line x1="-18" y1="0" x2="-10" y2="0" stroke="#22D3EE" strokeWidth="1.2" />
                    <line x1="10" y1="0" x2="18" y2="0" stroke="#22D3EE" strokeWidth="1.2" />
                    <line x1="0" y1="-18" x2="0" y2="-10" stroke="#22D3EE" strokeWidth="1.2" />
                    <line x1="0" y1="10" x2="0" y2="18" stroke="#22D3EE" strokeWidth="1.2" />
                  </>
                )}

                {/* Town Node Point */}
                <circle
                  r={isSelected ? 6.5 : 5}
                  fill="#07090E"
                  stroke={isSelected ? '#22D3EE' : tone.hex}
                  strokeWidth={isSelected ? 2.2 : 1.8}
                />
                <circle r={isSelected ? 3 : 2.2} fill={tone.hex} />

                {/* Town Label + Interpolated Value */}
                {(showAllTownLabels || isSelected) && (
                  <g transform="translate(8, -6)">
                    <rect
                      x="-2"
                      y="-9"
                      width={town.name.length * 5.2 + 34}
                      height="14"
                      rx="2"
                      fill="#07090E"
                      fillOpacity={isSelected ? '0.95' : '0.82'}
                      stroke={isSelected ? '#22D3EE' : '#1E293B'}
                      strokeWidth={isSelected ? '1' : '0.75'}
                    />
                    <text
                      x="2"
                      y="1"
                      fill={isSelected ? '#F8FAFC' : '#CBD5E1'}
                      fontSize="8.5"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {town.name.split(' / ')[0]}
                    </text>
                    <text
                      x={town.name.length * 5.2 + 4}
                      y="1"
                      fill={tone.hex}
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                    >
                      {val}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Top-Left HUD Overlay: Wind Compass & Advection Vector */}
        <div className="absolute top-3 left-3 bg-[#07090E]/90 border border-slate-800 px-3 py-2 pointer-events-none flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center bg-[#0B0E17]">
            <Compass className="w-4 h-4 text-slate-600" />
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${windToDeg}deg)` }}
            >
              <div className="w-0.5 h-7 bg-cyan-400 relative">
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400 rotate-[-45deg]" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-slate-400">
              WIND ADVECTION VECTOR
            </div>
            <div className="text-sm font-mono font-bold tabular-nums text-slate-100">
              {meteorology.windDirectionDeg}° {meteorology.windCardinal} · {meteorology.windSpeedKnots} kt ({meteorology.windSpeedMs} m/s)
            </div>
            <div className="text-[11px] font-mono text-cyan-400 truncate max-w-[260px]">
              {meteorology.plumeVectorLabel}
            </div>
          </div>
        </div>

        {/* Bottom-Left HUD Overlay: Live Cursor Coordinates */}
        {cursorCoords && (
          <div className="absolute bottom-3 left-3 bg-[#07090E]/90 border border-slate-800 px-2.5 py-1 pointer-events-none text-[11px] font-mono tabular-nums text-slate-300">
            PROBE: {cursorCoords.lat.toFixed(4)}°N, {cursorCoords.lng.toFixed(4)}°E · IDW p=2.0
          </div>
        )}

        {/* Bottom-Right HUD Overlay: NEA Scale Legend */}
        <div className="absolute bottom-3 right-3 bg-[#07090E]/90 border border-slate-800 px-3 py-1.5 pointer-events-none flex items-center gap-3 text-[11px] font-mono">
          <span className="text-slate-400">
            {metricMode === 'pm25' ? 'PM2.5 BAND:' : '24H PSI:'}
          </span>
          <span className="text-emerald-400">● {metricMode === 'pm25' ? '0-35 Normal' : '0-50 Good'}</span>
          <span className="text-cyan-400">◆ {metricMode === 'pm25' ? '36-55 Normal+' : '51-100 Mod'}</span>
          <span className="text-amber-400">▲ {metricMode === 'pm25' ? '56-150 Elev' : '101-200 Unhlth'}</span>
          <span className="text-rose-400">✖ {metricMode === 'pm25' ? '>150 High' : '>200 Haz'}</span>
        </div>
      </div>

      {/* Bottom Horizon Scrubber Bar (NOW, +1h, +3h, +6h, +12h, +24h) */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 border-t border-slate-800 bg-[#0F1420]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">
            FORECAST HORIZON SCRUBBER:
          </span>
          <div className="flex items-center gap-1">
            {(['NOW', '+1h', '+3h', '+6h', '+12h', '+24h'] as HorizonKey[]).map((hKey) => {
              const active = activeHorizon === hKey;
              return (
                <button
                  key={hKey}
                  type="button"
                  onClick={() => onSelectHorizon(hKey)}
                  className={`px-3 py-1 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 rounded ${
                    active
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-[#07090E] text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {hKey}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-300">
          <span>
            ISLAND MEAN:{' '}
            <strong className="text-slate-100">
              {metricMode === 'pm25'
                ? `${horizonForecast.islandAvgPm25} µg/m³`
                : `${horizonForecast.islandAvgPsi} PSI`}
            </strong>
          </span>
          <span className="text-slate-600">·</span>
          <span>
            PEAK SECTOR:{' '}
            <strong className="text-amber-400">
              {metricMode === 'pm25'
                ? `${horizonForecast.islandMaxPm25} µg/m³`
                : `${horizonForecast.islandMaxPsi} PSI`}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};

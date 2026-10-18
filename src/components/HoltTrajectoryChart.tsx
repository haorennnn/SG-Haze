import React, { useState } from 'react';
import {
  HorizonKey,
  HourlyTrajectoryPoint,
  RegionHorizonForecast,
  RegionKey,
} from '../types/haze';
import { getMetricVisualTone } from '../services/forecastEngine';
import { Activity, TrendingUp } from 'lucide-react';

interface HoltTrajectoryChartProps {
  hourlyTrajectory: HourlyTrajectoryPoint[];
  horizonForecasts: Record<HorizonKey, RegionHorizonForecast>;
  metricMode: 'pm25' | 'psi';
  activeHorizon: HorizonKey;
  onSelectHorizon: (h: HorizonKey) => void;
}

const REGION_META: Array<{ key: RegionKey; label: string; color: string }> = [
  { key: 'west', label: 'West', color: '#F59E0B' },
  { key: 'south', label: 'South', color: '#06B6D4' },
  { key: 'central', label: 'Central', color: '#10B981' },
  { key: 'north', label: 'North', color: '#A855F7' },
  { key: 'east', label: 'East', color: '#3B82F6' },
];

const HORIZON_LIST: HorizonKey[] = ['+1h', '+3h', '+6h', '+12h', '+24h'];

export const HoltTrajectoryChart: React.FC<HoltTrajectoryChartProps> = ({
  hourlyTrajectory,
  horizonForecasts,
  metricMode,
  activeHorizon,
  onSelectHorizon,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusRegion, setFocusRegion] = useState<RegionKey | 'all'>('all');

  const width = 880;
  const height = 230;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Compute y-axis max
  const allValues: number[] = [];
  for (const pt of hourlyTrajectory) {
    for (const r of REGION_META) {
      allValues.push(
        metricMode === 'pm25' ? pt.regions[r.key].pm25 : pt.regions[r.key].psi24h
      );
    }
  }
  const maxVal = Math.max(metricMode === 'pm25' ? 80 : 120, Math.ceil((Math.max(...allValues, 50) * 1.15) / 20) * 20);
  const minVal = 0;

  const getX = (idx: number) =>
    padLeft + (idx / Math.max(1, hourlyTrajectory.length - 1)) * plotW;
  const getY = (v: number) =>
    padTop + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  // Index of NOW (hourOffset === 0)
  const nowIdx = hourlyTrajectory.findIndex((p) => p.hourOffset === 0);
  const nowX = nowIdx >= 0 ? getX(nowIdx) : padLeft + plotW * 0.33;

  const yTicks = [
    0,
    Math.round(maxVal * 0.25),
    Math.round(maxVal * 0.5),
    Math.round(maxVal * 0.75),
    maxVal,
  ];

  const activeHoverPoint =
    hoverIdx !== null && hourlyTrajectory[hoverIdx] ? hourlyTrajectory[hoverIdx] : null;

  return (
    <div className="bg-[#0B0E17] border border-slate-800 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0F1420]">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200">
            HOLT LINEAR + WIND ADVECTION FORECAST ENGINE (-11H OBSERVED TO +24H PROJECTED)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFocusRegion('all')}
            className={`px-2 py-0.5 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
              focusRegion === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-600'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All 5 Regions
          </button>
          {REGION_META.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setFocusRegion(r.key)}
              className={`px-2 py-0.5 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                focusRegion === r.key
                  ? 'bg-slate-800 text-slate-100 border border-slate-600'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className="inline-block w-2 h-0.5"
                style={{ backgroundColor: r.color }}
              />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Time-Series Waveform */}
      <div className="relative px-3 pt-3 pb-1 bg-[#080B12]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[215px] overflow-visible select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Shaded Forecast Zone (Right of NOW) */}
          <rect
            x={nowX}
            y={padTop}
            width={width - padRight - nowX}
            height={plotH}
            fill="#06B6D4"
            fillOpacity="0.03"
          />

          {/* Horizontal Grid Lines & Y-Axis Ticks */}
          {yTicks.map((tVal) => {
            const y = getY(tVal);
            return (
              <g key={`ytick-${tVal}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tVal}
                </text>
              </g>
            );
          })}

          {/* NEA Threshold Reference Line (55 ug/m3 for PM2.5 Elevated or 100 for PSI Unhealthy) */}
          {(() => {
            const threshold = metricMode === 'pm25' ? 55 : 100;
            if (threshold >= maxVal) return null;
            const ty = getY(threshold);
            return (
              <g>
                <line
                  x1={padLeft}
                  y1={ty}
                  x2={width - padRight}
                  y2={ty}
                  stroke="#F59E0B"
                  strokeWidth="1"
                  strokeDasharray="5 4"
                  strokeOpacity="0.65"
                />
                <text
                  x={width - padRight - 4}
                  y={ty - 4}
                  textAnchor="end"
                  fill="#F59E0B"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  NEA {metricMode === 'pm25' ? 'ELEVATED (55 µg/m³)' : 'UNHEALTHY (100 PSI)'}
                </text>
              </g>
            );
          })()}

          {/* Vertical NOW Divider */}
          <line
            x1={nowX}
            y1={padTop}
            x2={nowX}
            y2={padTop + plotH}
            stroke="#22D3EE"
            strokeWidth="1.4"
          />
          <text
            x={nowX + 5}
            y={padTop + 10}
            fill="#22D3EE"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
          >
            T=0 (NOW) → HOLT + WIND ADVECTION FORECAST
          </text>

          {/* Vertical Horizon Markers (+1h, +3h, +6h, +12h, +24h) */}
          {[1, 3, 6, 12, 24].map((hAhead) => {
            const idx = hourlyTrajectory.findIndex((p) => p.hourOffset === hAhead);
            if (idx < 0) return null;
            const hx = getX(idx);
            const hKey = `+${hAhead}h` as HorizonKey;
            const isSelectedH = activeHorizon === hKey;
            return (
              <g
                key={`hmark-${hAhead}`}
                onClick={() => onSelectHorizon(hKey)}
                className="cursor-pointer"
              >
                <line
                  x1={hx}
                  y1={padTop}
                  x2={hx}
                  y2={padTop + plotH}
                  stroke={isSelectedH ? '#22D3EE' : '#334155'}
                  strokeWidth={isSelectedH ? '1.4' : '0.8'}
                  strokeDasharray="2 3"
                />
                <text
                  x={hx}
                  y={height - 8}
                  textAnchor="middle"
                  fill={isSelectedH ? '#22D3EE' : '#94A3B8'}
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={isSelectedH ? '700' : '500'}
                >
                  +{hAhead}h
                </text>
              </g>
            );
          })}

          {/* Historical X-Axis Labels */}
          {[-11, -6, 0].map((hOff) => {
            const idx = hourlyTrajectory.findIndex((p) => p.hourOffset === hOff);
            if (idx < 0) return null;
            const hx = getX(idx);
            return (
              <text
                key={`hist-lbl-${hOff}`}
                x={hx}
                y={height - 8}
                textAnchor="middle"
                fill={hOff === 0 ? '#22D3EE' : '#64748B'}
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {hOff === 0 ? 'NOW' : `${hOff}h`}
              </text>
            );
          })}

          {/* Region Trajectory Curves (Solid for Historical, Dashed for Forecast) */}
          {REGION_META.map((reg) => {
            const isDimmed = focusRegion !== 'all' && focusRegion !== reg.key;
            const histPts = hourlyTrajectory
              .slice(0, nowIdx + 1)
              .map((pt, i) => {
                const v =
                  metricMode === 'pm25' ? pt.regions[reg.key].pm25 : pt.regions[reg.key].psi24h;
                return `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(v).toFixed(1)}`;
              })
              .join(' ');

            const forecastPts = hourlyTrajectory
              .slice(nowIdx)
              .map((pt, i) => {
                const globalIdx = nowIdx + i;
                const v =
                  metricMode === 'pm25' ? pt.regions[reg.key].pm25 : pt.regions[reg.key].psi24h;
                return `${i === 0 ? 'M' : 'L'} ${getX(globalIdx).toFixed(1)} ${getY(v).toFixed(1)}`;
              })
              .join(' ');

            return (
              <g key={`curve-${reg.key}`} opacity={isDimmed ? 0.18 : 1}>
                <path
                  d={histPts}
                  fill="none"
                  stroke={reg.color}
                  strokeWidth={focusRegion === reg.key ? '2.4' : '1.7'}
                />
                <path
                  d={forecastPts}
                  fill="none"
                  stroke={reg.color}
                  strokeWidth={focusRegion === reg.key ? '2.4' : '1.7'}
                  strokeDasharray="4 2.5"
                />
              </g>
            );
          })}

          {/* Interactive Crosshair Columns */}
          {hourlyTrajectory.map((pt, idx) => {
            const x = getX(idx);
            const colW = plotW / hourlyTrajectory.length;
            return (
              <rect
                key={`hit-${pt.hourOffset}`}
                x={x - colW / 2}
                y={padTop}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}

          {/* Active Crosshair Line */}
          {hoverIdx !== null && (
            <line
              x1={getX(hoverIdx)}
              y1={padTop}
              x2={getX(hoverIdx)}
              y2={padTop + plotH}
              stroke="#E2E8F0"
              strokeWidth="1"
            />
          )}
        </svg>

        {/* Floating Crosshair Readout Bar */}
        {activeHoverPoint && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#0F1420] border border-slate-800 text-xs font-mono tabular-nums mb-2">
            <span className="text-cyan-400 font-semibold">
              {activeHoverPoint.isForecast ? `FORECAST ${activeHoverPoint.label}` : `OBSERVED ${activeHoverPoint.label}`}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {REGION_META.map((r) => {
                const v =
                  metricMode === 'pm25'
                    ? activeHoverPoint.regions[r.key].pm25
                    : activeHoverPoint.regions[r.key].psi24h;
                return (
                  <span key={r.key} className="text-slate-300">
                    <span className="text-slate-400">{r.label}:</span>{' '}
                    <strong style={{ color: r.color }}>{v}</strong>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* +1h / +3h / +6h / +12h / +24h Horizon Matrix Table */}
      <div className="border-t border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0F1420] border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <th className="py-2 px-3 font-medium">HORIZON</th>
              <th className="py-2 px-3 font-medium text-right">NORTH</th>
              <th className="py-2 px-3 font-medium text-right">SOUTH</th>
              <th className="py-2 px-3 font-medium text-right">EAST</th>
              <th className="py-2 px-3 font-medium text-right">WEST</th>
              <th className="py-2 px-3 font-medium text-right">CENTRAL</th>
              <th className="py-2 px-3 font-medium text-right">ISLAND MEAN</th>
              <th className="py-2 px-3 font-medium text-right">PEAK 90% CI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
            {(['NOW', ...HORIZON_LIST] as HorizonKey[]).map((hKey) => {
              const hf = horizonForecasts[hKey];
              const isSelected = activeHorizon === hKey;
              const peakKey = (['north', 'south', 'east', 'west', 'central'] as RegionKey[]).reduce(
                (best, k) =>
                  (metricMode === 'pm25' ? hf.regions[k].pm25 : hf.regions[k].psi24h) >
                  (metricMode === 'pm25' ? hf.regions[best].pm25 : hf.regions[best].psi24h)
                    ? k
                    : best,
                'west' as RegionKey
              );
              const peakReg = hf.regions[peakKey];
              const meanVal = metricMode === 'pm25' ? hf.islandAvgPm25 : hf.islandAvgPsi;
              const meanTone = getMetricVisualTone(meanVal, metricMode);

              return (
                <tr
                  key={hKey}
                  onClick={() => onSelectHorizon(hKey)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/70'
                  }`}
                >
                  <td className="py-2 px-3 font-semibold text-slate-200 whitespace-nowrap">
                    <span className={isSelected ? 'text-cyan-400' : 'text-slate-300'}>
                      {hKey}
                    </span>
                    {hKey !== 'NOW' && (
                      <span className="text-[10px] text-slate-500 ml-1.5">
                        Holt+Adv
                      </span>
                    )}
                  </td>
                  {(['north', 'south', 'east', 'west', 'central'] as RegionKey[]).map((rKey) => {
                    const rData = hf.regions[rKey];
                    const v = metricMode === 'pm25' ? rData.pm25 : rData.psi24h;
                    const tone = getMetricVisualTone(v, metricMode);
                    return (
                      <td key={rKey} className={`py-2 px-3 text-right ${tone.textClass}`}>
                        {v}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-right font-semibold text-slate-100">
                    <span className={meanTone.textClass}>{meanVal}</span>{' '}
                    <span className="text-[10px] text-slate-500">
                      {metricMode === 'pm25' ? 'µg/m³' : 'PSI'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400 whitespace-nowrap">
                    {hKey === 'NOW' ? (
                      <span className="text-slate-500">Observed</span>
                    ) : metricMode === 'pm25' ? (
                      `${peakReg.pm25Lower}–${peakReg.pm25Upper} µg/m³`
                    ) : (
                      `${peakReg.psiLower}–${peakReg.psiUpper} PSI`
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

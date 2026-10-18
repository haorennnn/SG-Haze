import React, { useMemo, useState } from 'react';
import { getMetricVisualTone } from '../services/forecastEngine';
import { HorizonKey, RegionKey, TownInterpolated } from '../types/haze';
import { ArrowUpDown, MapPin, Search } from 'lucide-react';

interface TownIdwGridProps {
  towns: TownInterpolated[];
  selectedTownId: string;
  onSelectTown: (id: string) => void;
  activeHorizon: HorizonKey;
  metricMode: 'pm25' | 'psi';
  idwPower: number;
}

const REGION_GROUPS = ['All', 'North', 'North-East', 'East', 'Central', 'South', 'West'] as const;

export const TownIdwGrid: React.FC<TownIdwGridProps> = ({
  towns,
  selectedTownId,
  onSelectTown,
  activeHorizon,
  metricMode,
  idwPower,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'severity' | 'index' | 'delta6h'>('severity');

  const selectedTown = useMemo(
    () => towns.find((t) => t.id === selectedTownId) || towns[0],
    [towns, selectedTownId]
  );

  const filteredTowns = useMemo(() => {
    return towns
      .filter((t) => {
        const matchesRegion = regionFilter === 'All' || t.regionGroup === regionFilter;
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.planningArea.toLowerCase().includes(q) ||
          t.regionGroup.toLowerCase().includes(q);
        return matchesRegion && matchesQuery;
      })
      .sort((a, b) => {
        if (sortBy === 'index') return a.index - b.index;
        if (sortBy === 'delta6h') {
          const da =
            metricMode === 'pm25'
              ? a.horizons['+6h'].pm25 - a.horizons.NOW.pm25
              : a.horizons['+6h'].psi - a.horizons.NOW.psi;
          const db =
            metricMode === 'pm25'
              ? b.horizons['+6h'].pm25 - b.horizons.NOW.pm25
              : b.horizons['+6h'].psi - b.horizons.NOW.psi;
          return db - da;
        }
        const va =
          metricMode === 'pm25'
            ? a.horizons[activeHorizon].pm25
            : a.horizons[activeHorizon].psi;
        const vb =
          metricMode === 'pm25'
            ? b.horizons[activeHorizon].pm25
            : b.horizons[activeHorizon].psi;
        return vb - va;
      });
  }, [towns, regionFilter, searchQuery, sortBy, activeHorizon, metricMode]);

  return (
    <div className="bg-[#0B0E17] border border-slate-800 flex flex-col">
      {/* Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0F1420]">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200">
            23 SINGAPORE TOWN INVERSE DISTANCE WEIGHTING (IDW p={idwPower.toFixed(1)}) MATRIX
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter 23 towns..."
              className="bg-[#07090E] border border-slate-800 focus:border-cyan-500/60 focus:outline-none text-xs font-mono text-slate-200 pl-8 pr-2.5 py-1 rounded w-44"
            />
          </div>

          {/* Sort Selector */}
          <button
            type="button"
            onClick={() =>
              setSortBy((prev) =>
                prev === 'severity' ? 'delta6h' : prev === 'delta6h' ? 'index' : 'severity'
              )
            }
            className="px-2.5 py-1 text-xs font-mono bg-[#07090E] border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            Sort: {sortBy === 'severity' ? 'Highest Reading' : sortBy === 'delta6h' ? '+6h Surge' : 'Town ID (1-23)'}
          </button>
        </div>
      </div>

      {/* Region Sector Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-800 bg-[#080B12]">
        <div className="flex flex-wrap items-center gap-1">
          {REGION_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setRegionFilter(group)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                regionFilter === group
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-slate-400 tabular-nums">
          Showing {filteredTowns.length} of 23 Singapore Towns
        </span>
      </div>

      {/* Selected Town Mathematical IDW Weight Breakdown Banner */}
      {selectedTown && (
        <div className="px-4 py-3 border-b border-slate-800 bg-[#0D1322] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>TOWN #{String(selectedTown.index).padStart(2, '0')} INSPECTOR</span>
              <span>·</span>
              <span>{selectedTown.regionGroup.toUpperCase()} SECTOR</span>
              <span>·</span>
              <span>
                {selectedTown.lat.toFixed(4)}°N, {selectedTown.lng.toFixed(4)}°E
              </span>
              <span>·</span>
              <span>
                NEAREST ANCHOR: NEA {selectedTown.nearestRegion.toUpperCase()} ({selectedTown.nearestDistanceKm} km)
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h3 className="text-base font-bold text-slate-100">
                {selectedTown.name}
              </h3>
              <span className="text-xs text-slate-400">
                {selectedTown.planningArea} · Pop. {selectedTown.population}
              </span>
            </div>
          </div>

          {/* 5-Station IDW Weight Coefficients */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400">
              IDW WEIGHTS (∑w=1.00):
            </span>
            {(['north', 'south', 'east', 'west', 'central'] as RegionKey[]).map((rKey) => {
              const w = selectedTown.weights[rKey];
              return (
                <div
                  key={rKey}
                  className="bg-[#07090E] border border-slate-800 px-2.5 py-1 text-xs font-mono tabular-nums"
                >
                  <span className="text-slate-400 uppercase">{rKey.slice(0, 3)}:</span>{' '}
                  <strong className="text-cyan-300">{(w * 100).toFixed(1)}%</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* High-Density 23-Town Data Table */}
      <div className="overflow-x-auto max-h-[430px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[#0F1420] border-b border-slate-800 text-[11px] font-mono text-slate-400">
            <tr>
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">SINGAPORE TOWN</th>
              <th className="py-2 px-3 font-medium">SECTOR · COORDS</th>
              <th className="py-2 px-3 font-medium text-right">DOMINANT ANCHOR</th>
              <th className="py-2 px-3 font-medium text-right">NOW</th>
              <th className="py-2 px-3 font-medium text-right">+1H</th>
              <th className="py-2 px-3 font-medium text-right">+3H</th>
              <th className="py-2 px-3 font-medium text-right">+6H</th>
              <th className="py-2 px-3 font-medium text-right">+12H</th>
              <th className="py-2 px-3 font-medium text-right">+24H</th>
              <th className="py-2 px-3 font-medium text-right">STATUS ({activeHorizon})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
            {filteredTowns.map((town) => {
              const isSelected = town.id === selectedTownId;
              const activeVal =
                metricMode === 'pm25'
                  ? town.horizons[activeHorizon].pm25
                  : town.horizons[activeHorizon].psi;
              const tone = getMetricVisualTone(activeVal, metricMode);

              return (
                <tr
                  key={town.id}
                  onClick={() => onSelectTown(town.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-500/12' : 'hover:bg-slate-900/70'
                  }`}
                >
                  <td className="py-2 px-3 text-slate-500">
                    {String(town.index).padStart(2, '0')}
                  </td>
                  <td className="py-2 px-3 font-sans font-semibold text-slate-100 whitespace-nowrap">
                    {town.name}
                  </td>
                  <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                    {town.regionGroup} · {town.lat.toFixed(3)}°N {town.lng.toFixed(3)}°E
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300 whitespace-nowrap">
                    NEA {town.nearestRegion.toUpperCase()} ({(town.weights[town.nearestRegion] * 100).toFixed(0)}%)
                  </td>
                  {(['NOW', '+1h', '+3h', '+6h', '+12h', '+24h'] as HorizonKey[]).map((hKey) => {
                    const v =
                      metricMode === 'pm25' ? town.horizons[hKey].pm25 : town.horizons[hKey].psi;
                    const cellTone = getMetricVisualTone(v, metricMode);
                    const isColActive = activeHorizon === hKey;
                    return (
                      <td
                        key={hKey}
                        className={`py-2 px-3 text-right ${cellTone.textClass} ${
                          isColActive ? 'font-bold bg-slate-800/40' : ''
                        }`}
                      >
                        {v}
                      </td>
                    );
                  })}
                  <td className={`py-2 px-3 text-right whitespace-nowrap ${tone.textClass}`}>
                    {tone.glyph} {tone.descriptor}
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

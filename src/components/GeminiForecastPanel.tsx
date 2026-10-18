import React from 'react';
import { GeminiForecastReport } from '../types/haze';
import { Cpu, RefreshCw, ShieldAlert } from 'lucide-react';

interface GeminiForecastPanelProps {
  report: GeminiForecastReport | null;
  isLoading: boolean;
  error: string | null;
  onGenerate: () => void;
  selectedTownName: string;
}

export const GeminiForecastPanel: React.FC<GeminiForecastPanelProps> = ({
  report,
  isLoading,
  error,
  onGenerate,
  selectedTownName,
}) => {
  const getAlertTone = (level?: string) => {
    const u = (level || '').toUpperCase();
    if (u.includes('HAZARD') || u.includes('CRITICAL')) {
      return { text: 'text-rose-400', glyph: '✖', label: level };
    }
    if (u.includes('UNHEALTHY')) {
      return { text: 'text-amber-400', glyph: '▲', label: level };
    }
    if (u.includes('ELEVATED') || u.includes('WATCH')) {
      return { text: 'text-cyan-400', glyph: '◆', label: level };
    }
    return { text: 'text-emerald-400', glyph: '●', label: level || 'NOMINAL' };
  };

  const alertTone = getAlertTone(report?.alertLevel);

  return (
    <div className="bg-[#0B0E17] border border-slate-800 flex flex-col">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0F1420]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200">
            GEMINI AI METEOROLOGICAL & PLUME DISPERSION BRIEFING
          </span>
          {report?.modelUsed && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-mono text-slate-400">
                {report.modelUsed}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            Focus: <strong className="text-slate-200">{selectedTownName}</strong>
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading}
            className="px-3.5 py-1.5 text-xs font-mono font-semibold bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Synthesizing Forecast...' : 'Run Gemini AI Forecast'}
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-4">
        {error && (
          <div className="p-3 bg-rose-950/30 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-center justify-between gap-4 mb-3">
            <span>Forecast synthesis error: {error}</span>
            <button
              type="button"
              onClick={onGenerate}
              className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded whitespace-nowrap shrink-0"
            >
              Retry Analysis
            </button>
          </div>
        )}

        {isLoading && !report && (
          <div className="space-y-3 py-6">
            <div className="h-5 bg-slate-800/70 rounded w-2/3 animate-pulse" />
            <div className="h-16 bg-slate-800/50 rounded w-full animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-24 bg-slate-800/40 rounded animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && !report && !error && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-300 mb-3">
              Ready to synthesize live 5-region NEA telemetry, 23-town IDW spatial grid, and +1h to +24h Holt wind advection trajectories.
            </p>
            <button
              type="button"
              onClick={onGenerate}
              className="px-4 py-2 text-xs font-mono font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded transition-colors"
            >
              Generate Meteorological Briefing
            </button>
          </div>
        )}

        {report && (
          <div className="space-y-5">
            {/* Top Briefing Summary Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-4 border-b border-slate-800">
              <div className="lg:col-span-8 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className={`font-bold ${alertTone.text}`}>
                    {alertTone.glyph} {alertTone.label}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">
                    CONFIDENCE: <strong className="text-slate-200">{report.modelConfidence}%</strong>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">
                    VARIANCE DRIVER: <span className="text-slate-300">{report.primaryUncertaintyFactor}</span>
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-100 leading-snug">
                  {report.headline}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {report.executiveSummary}
                </p>
              </div>

              <div className="lg:col-span-4 bg-[#07090E] border border-slate-800 p-3 space-y-1.5">
                <div className="text-[11px] font-mono text-cyan-400 font-semibold">
                  SYNOPTIC & MONSOON ADVECTION DYNAMICS
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {report.synopticAnalysis}
                </p>
              </div>
            </div>

            {/* +1h / +3h / +6h / +12h / +24h AI Horizon Breakdown */}
            <div>
              <div className="text-xs font-mono text-slate-400 mb-2">
                MULTI-HORIZON AI TRAJECTORY ASSESSMENT (+1H TO +24H)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {report.horizonCommentary.map((item, idx) => (
                  <div
                    key={`${item.horizon}-${idx}`}
                    className="bg-[#07090E] border border-slate-800 p-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 mb-2">
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {item.horizon}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-200">
                          {item.expectedPsiRange}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-amber-400 mb-1.5">
                        Peak: {item.expectedPm25Peak}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {item.physicalDriver}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Split: Town Hotspots & NEA Health Advisories */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-slate-800">
              {/* Vulnerable Singapore Towns */}
              <div className="lg:col-span-7">
                <div className="text-xs font-mono text-slate-400 mb-2">
                  23-TOWN IDW LOCALIZED EXPOSURE WATCHLIST
                </div>
                <div className="divide-y divide-slate-800 border border-slate-800 bg-[#07090E]">
                  {report.townHotspots.map((spot, i) => (
                    <div
                      key={`${spot.town}-${i}`}
                      className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-100">{spot.town}</span>
                        <span className="text-slate-500 mx-1.5">·</span>
                        <span className="font-mono text-slate-400">{spot.region}</span>
                        <p className="text-slate-400 mt-0.5">{spot.riskAssessment}</p>
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                        <span className="text-slate-300">
                          NOW: <strong className="text-slate-100">{spot.currentPm25}</strong> µg/m³
                        </span>
                        <span className="text-cyan-400">
                          +6H: <strong>{spot.projected6hPm25}</strong> µg/m³
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health & Civil Defense Advisories */}
              <div className="lg:col-span-5">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 mb-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>NEA HEALTH & ACTIVITY PROTOCOL</span>
                </div>
                <div className="bg-[#07090E] border border-slate-800 divide-y divide-slate-800 text-xs">
                  <div className="p-2.5">
                    <div className="font-mono text-slate-400 text-[11px] mb-0.5">
                      GENERAL PUBLIC
                    </div>
                    <p className="text-slate-200">{report.healthAdvisories.generalPublic}</p>
                  </div>
                  <div className="p-2.5">
                    <div className="font-mono text-amber-400 text-[11px] mb-0.5">
                      SENSITIVE GROUPS (ELDERLY, CHILDREN, RESPIRATORY/CARDIAC)
                    </div>
                    <p className="text-slate-200">{report.healthAdvisories.sensitiveGroups}</p>
                  </div>
                  <div className="p-2.5">
                    <div className="font-mono text-cyan-400 text-[11px] mb-0.5">
                      OUTDOOR WORKERS & ATHLETIC ENDURANCE
                    </div>
                    <p className="text-slate-200">{report.healthAdvisories.outdoorOperations}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

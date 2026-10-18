import { NEA_REGIONS, SINGAPORE_23_TOWNS } from '../data/singaporeGeography';
import {
  HoltParams,
  HorizonKey,
  HourlyTrajectoryPoint,
  MeteorologyState,
  Pm25Band,
  PsiCategory,
  RegionHorizonForecast,
  RegionKey,
  RegionTelemetry,
  TownHorizonMetrics,
  TownInterpolated,
} from '../types/haze';

const REGION_KEYS: RegionKey[] = ['north', 'south', 'east', 'west', 'central'];
export const FORECAST_HORIZONS: Array<{ key: HorizonKey; hours: number }> = [
  { key: 'NOW', hours: 0 },
  { key: '+1h', hours: 1 },
  { key: '+3h', hours: 3 },
  { key: '+6h', hours: 6 },
  { key: '+12h', hours: 12 },
  { key: '+24h', hours: 24 },
];

/**
 * NEA 1-hr PM2.5 Concentration Bands (ug/m3)
 * Band I (Normal): 0 - 55
 * Band II (Elevated): 56 - 150
 * Band III (High): 151 - 250
 * Band IV (Very High): > 250
 */
export function getPm25Band(pm25: number): Pm25Band {
  if (pm25 <= 55) return 'Normal';
  if (pm25 <= 150) return 'Elevated';
  if (pm25 <= 250) return 'High';
  return 'Very High';
}

/**
 * NEA 24-hr PSI Descriptors
 * Good: 0 - 50
 * Moderate: 51 - 100
 * Unhealthy: 101 - 200
 * Very Unhealthy: 201 - 300
 * Hazardous: > 300
 */
export function getPsiCategory(psi: number): PsiCategory {
  if (psi <= 50) return 'Good';
  if (psi <= 100) return 'Moderate';
  if (psi <= 200) return 'Unhealthy';
  if (psi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * Semantic color & glyph mapping (never hue-only; includes explicit glyph + text)
 */
export function getMetricVisualTone(value: number, mode: 'pm25' | 'psi'): {
  hex: string;
  textClass: string;
  borderClass: string;
  bgSubtleClass: string;
  glyph: string;
  descriptor: string;
} {
  const isPm25 = mode === 'pm25';
  const level = isPm25
    ? value <= 35
      ? 0
      : value <= 55
      ? 1
      : value <= 150
      ? 2
      : value <= 250
      ? 3
      : 4
    : value <= 50
    ? 0
    : value <= 100
    ? 1
    : value <= 200
    ? 2
    : value <= 300
    ? 3
    : 4;

  const descriptor = isPm25 ? getPm25Band(value) : getPsiCategory(value);

  switch (level) {
    case 0:
      return {
        hex: '#10B981',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/40',
        bgSubtleClass: 'bg-emerald-500/10',
        glyph: '●',
        descriptor,
      };
    case 1:
      return {
        hex: '#06B6D4',
        textClass: 'text-cyan-400',
        borderClass: 'border-cyan-500/40',
        bgSubtleClass: 'bg-cyan-500/10',
        glyph: '◆',
        descriptor,
      };
    case 2:
      return {
        hex: '#F59E0B',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-500/40',
        bgSubtleClass: 'bg-amber-500/10',
        glyph: '▲',
        descriptor,
      };
    case 3:
      return {
        hex: '#F97316',
        textClass: 'text-orange-400',
        borderClass: 'border-orange-500/40',
        bgSubtleClass: 'bg-orange-500/10',
        glyph: '▲',
        descriptor,
      };
    default:
      return {
        hex: '#F43F5E',
        textClass: 'text-rose-400',
        borderClass: 'border-rose-500/50',
        bgSubtleClass: 'bg-rose-500/15',
        glyph: '✖',
        descriptor,
      };
  }
}

/**
 * Great-circle Haversine distance in kilometers between two coordinates
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Damped Holt Linear Double Exponential Smoothing
 * Returns smoothed level L_T, trend B_T, and residual standard error
 */
export function fitDampedHoltLinear(
  series: number[],
  alpha: number,
  beta: number,
  phi: number
): { level: number; trend: number; rmse: number } {
  if (!series || series.length === 0) {
    return { level: 18, trend: 0, rmse: 2.0 };
  }
  if (series.length === 1) {
    return { level: series[0], trend: 0, rmse: 1.5 };
  }

  let level = series[0];
  let trend = series[1] - series[0];
  let sqErrSum = 0;

  for (let t = 1; t < series.length; t++) {
    const y = series[t];
    const prevLevel = level;
    const prevTrend = trend;
    const oneStepPred = prevLevel + phi * prevTrend;
    const err = y - oneStepPred;
    sqErrSum += err * err;

    level = alpha * y + (1 - alpha) * (prevLevel + phi * prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * prevTrend;
  }

  const rmse = Math.sqrt(sqErrSum / Math.max(1, series.length - 1));
  return { level, trend, rmse: Math.max(1.2, rmse) };
}

/**
 * Computes damped trend sum: sum_{k=1..h} phi^k
 */
function dampedHorizonMultiplier(phi: number, h: number): number {
  if (h <= 0) return 0;
  if (Math.abs(1 - phi) < 1e-5) return h;
  return (phi * (1 - Math.pow(phi, h))) / (1 - phi);
}

/**
 * Runs the full Holt Linear + Wind Advection Forecast Engine across +1h, +3h, +6h, +12h, +24h
 * and generates the 36-hour continuous trajectory (-11h to +24h)
 */
export function runHoltWindAdvectionEngine(
  regions: Record<RegionKey, RegionTelemetry>,
  meteorology: MeteorologyState,
  params: HoltParams
): {
  horizonForecasts: Record<HorizonKey, RegionHorizonForecast>;
  hourlyTrajectory: HourlyTrajectoryPoint[];
} {
  // 1. Fit Holt Linear parameters for each region's PM2.5 and PSI series
  const holtPm25 = {} as Record<RegionKey, { level: number; trend: number; rmse: number }>;
  const holtPsi = {} as Record<RegionKey, { level: number; trend: number; rmse: number }>;

  for (const key of REGION_KEYS) {
    holtPm25[key] = fitDampedHoltLinear(
      regions[key].pm25History,
      params.alpha,
      params.beta,
      params.phi
    );
    holtPsi[key] = fitDampedHoltLinear(
      regions[key].psiHistory,
      Math.max(0.25, params.alpha * 0.8),
      Math.max(0.1, params.beta * 0.75),
      params.phi
    );
  }

  // 2. Wind propagation vector (direction wind blows TOWARD)
  // Meteorological windDirectionDeg is where wind comes FROM (0 = North, 90 = East, 180 = South, 270 = West)
  const fromRad = (meteorology.windDirectionDeg * Math.PI) / 180;
  const windTowardEast = -Math.sin(fromRad);  // +x (lng)
  const windTowardNorth = -Math.cos(fromRad); // +y (lat)

  // Effective advection speed factor (normalized around 8 knots)
  const speedFactor = Math.min(2.2, Math.max(0.2, meteorology.windSpeedKnots / 8.5));

  // Hygroscopic growth factor (high relative humidity >78% increases aerosol optical/mass persistence slightly)
  const hygroscopicBase = 1 + Math.max(-0.04, (meteorology.humidityPct - 75) * 0.0022);

  // Helper to compute forecast state at any hour h >= 0
  const computeAtHour = (h: number): RegionHorizonForecast => {
    const horizonKey: HorizonKey =
      h === 0
        ? 'NOW'
        : h === 1
        ? '+1h'
        : h === 3
        ? '+3h'
        : h === 6
        ? '+6h'
        : h === 12
        ? '+12h'
        : '+24h';

    const regionResults = {} as RegionHorizonForecast['regions'];
    const dampMult = dampedHorizonMultiplier(params.phi, h);
    // Atmospheric boundary-layer dispersion decay over longer horizons
    const dispersionDecay = Math.exp(-0.028 * h);

    for (const targetKey of REGION_KEYS) {
      const targetReg = regions[targetKey];
      if (h === 0) {
        regionResults[targetKey] = {
          pm25: Math.round(targetReg.pm25),
          psi24h: Math.round(targetReg.psi24h),
          pm25Lower: Math.round(targetReg.pm25),
          pm25Upper: Math.round(targetReg.pm25),
          psiLower: Math.round(targetReg.psi24h),
          psiUpper: Math.round(targetReg.psi24h),
          holtTrendComponent: 0,
          windAdvectionDelta: 0,
          transboundaryFlux: 0,
          hygroscopicFactor: Number(hygroscopicBase.toFixed(3)),
        };
        continue;
      }

      // A. Damped Holt Linear trend component
      const holtTrendDelta = dampMult * holtPm25[targetKey].trend * dispersionDecay;

      // B. Spatial Upwind-to-Downwind Inter-Regional Advection
      let upwindAdvectionSum = 0;
      let weightSum = 0;

      for (const sourceKey of REGION_KEYS) {
        if (sourceKey === targetKey) continue;
        const sourceReg = regions[sourceKey];
        const dEast = (targetReg.lng - sourceReg.lng) * 111.32;
        const dNorth = (targetReg.lat - sourceReg.lat) * 110.57;
        const distKm = Math.hypot(dEast, dNorth);
        if (distKm < 0.5) continue;

        // Unit vector from source station to target station
        const uEast = dEast / distKm;
        const uNorth = dNorth / distKm;

        // Alignment with wind propagation vector (>0 means source is upwind of target)
        const alignment = uEast * windTowardEast + uNorth * windTowardNorth;
        if (alignment > 0.15) {
          const w = (alignment * alignment) / Math.pow(distKm / 10, 1.2);
          const gradientDiff = sourceReg.pm25 - targetReg.pm25;
          upwindAdvectionSum += w * gradientDiff;
          weightSum += w;
        }
      }

      const rawAdvectionGradient = weightSum > 0 ? upwindAdvectionSum / weightSum : 0;
      // Time-integrated advection coupling across h hours (saturates smoothly as plume traverses the 42km island)
      const transitSaturation = 1 - Math.exp(-0.22 * h * speedFactor);
      const windAdvectionDelta =
        rawAdvectionGradient * 0.48 * transitSaturation * params.advectionWeight;

      // C. Transboundary Plume Boundary Flux (Sumatra / Kalimantan vs South China Sea clean air)
      // Upwind coastal exposure factor based on station location relative to wind arrival
      const coastalExposure =
        -windTowardEast * ((targetReg.lng - 103.82) * 4.5) +
        -windTowardNorth * ((targetReg.lat - 1.357) * 6.0);
      const exposureMultiplier = Math.max(0.55, Math.min(1.45, 1 + coastalExposure));

      const netTransboundarySignal =
        (meteorology.transboundaryRiskFactor - 0.32) *
        speedFactor *
        exposureMultiplier *
        params.advectionWeight;

      const transboundaryFlux =
        netTransboundarySignal * Math.min(8.5, Math.sqrt(h) * 2.4) * dispersionDecay;

      // Combine Base Level + Holt Damped Trend + Inter-Regional Wind Advection + Transboundary Flux
      const projectedPm25Raw =
        (holtPm25[targetKey].level + holtTrendDelta + windAdvectionDelta + transboundaryFlux) *
        hygroscopicBase;

      const pm25 = Math.max(4, Math.min(450, Math.round(projectedPm25Raw)));

      // 24-hr PSI moves more gradually as a 24-hour rolling index coupled to PM2.5 + Holt PSI trend
      const psiHoltDelta = dampMult * holtPsi[targetKey].trend * 0.65;
      const pm25DrivenPsiShift = (pm25 - targetReg.pm25) * 0.42 * Math.min(1, h / 12);
      const projectedPsiRaw = holtPsi[targetKey].level + psiHoltDelta + pm25DrivenPsiShift;
      const psi24h = Math.max(12, Math.min(420, Math.round(projectedPsiRaw)));

      // 90% Prediction Interval (1.645 * RMSE * sqrt(1 + 0.35 * h))
      const pm25Spread = Math.round(
        1.645 * holtPm25[targetKey].rmse * Math.sqrt(1 + 0.32 * h)
      );
      const psiSpread = Math.round(
        1.645 * holtPsi[targetKey].rmse * Math.sqrt(1 + 0.22 * h)
      );

      regionResults[targetKey] = {
        pm25,
        psi24h,
        pm25Lower: Math.max(3, pm25 - pm25Spread),
        pm25Upper: Math.min(500, pm25 + pm25Spread),
        psiLower: Math.max(10, psi24h - psiSpread),
        psiUpper: Math.min(500, psi24h + psiSpread),
        holtTrendComponent: Number(holtTrendDelta.toFixed(1)),
        windAdvectionDelta: Number(windAdvectionDelta.toFixed(1)),
        transboundaryFlux: Number(transboundaryFlux.toFixed(1)),
        hygroscopicFactor: Number(hygroscopicBase.toFixed(3)),
      };
    }

    const pm25Vals = REGION_KEYS.map((k) => regionResults[k].pm25);
    const psiVals = REGION_KEYS.map((k) => regionResults[k].psi24h);

    return {
      horizon: horizonKey,
      hoursAhead: h,
      regions: regionResults,
      islandAvgPm25: Math.round(pm25Vals.reduce((a, b) => a + b, 0) / pm25Vals.length),
      islandMaxPm25: Math.max(...pm25Vals),
      islandAvgPsi: Math.round(psiVals.reduce((a, b) => a + b, 0) / psiVals.length),
      islandMaxPsi: Math.max(...psiVals),
    };
  };

  // Compute key horizons
  const horizonForecasts = {
    NOW: computeAtHour(0),
    '+1h': computeAtHour(1),
    '+3h': computeAtHour(3),
    '+6h': computeAtHour(6),
    '+12h': computeAtHour(12),
    '+24h': computeAtHour(24),
  } as Record<HorizonKey, RegionHorizonForecast>;

  // Build continuous 36-point trajectory (-11h to 0h history, +1h to +24h forecast)
  const hourlyTrajectory: HourlyTrajectoryPoint[] = [];

  for (let idx = 0; idx < 12; idx++) {
    const hourOffset = idx - 11; // -11 to 0
    const regSnap = {} as Record<RegionKey, { pm25: number; psi24h: number }>;
    for (const k of REGION_KEYS) {
      regSnap[k] = {
        pm25: Math.round(regions[k].pm25History[idx] ?? regions[k].pm25),
        psi24h: Math.round(regions[k].psiHistory[idx] ?? regions[k].psi24h),
      };
    }
    const avgPm25 = Math.round(
      REGION_KEYS.reduce((s, k) => s + regSnap[k].pm25, 0) / REGION_KEYS.length
    );
    const avgPsi = Math.round(
      REGION_KEYS.reduce((s, k) => s + regSnap[k].psi24h, 0) / REGION_KEYS.length
    );
    hourlyTrajectory.push({
      hourOffset,
      label: hourOffset === 0 ? 'NOW' : `${hourOffset}h`,
      isForecast: false,
      regions: regSnap,
      islandAvgPm25: avgPm25,
      islandAvgPsi: avgPsi,
    });
  }

  for (let h = 1; h <= 24; h++) {
    const step = computeAtHour(h);
    const regSnap = {} as Record<RegionKey, { pm25: number; psi24h: number }>;
    for (const k of REGION_KEYS) {
      regSnap[k] = {
        pm25: step.regions[k].pm25,
        psi24h: step.regions[k].psi24h,
      };
    }
    hourlyTrajectory.push({
      hourOffset: h,
      label: `+${h}h`,
      isForecast: true,
      regions: regSnap,
      islandAvgPm25: step.islandAvgPm25,
      islandAvgPsi: step.islandAvgPsi,
    });
  }

  return { horizonForecasts, hourlyTrajectory };
}

/**
 * Computes Inverse Distance Weighting (IDW) interpolation for all 23 Singapore Towns
 * across NOW, +1h, +3h, +6h, +12h, and +24h horizons.
 * Formula: w_i = (1 / d_i^p) / sum_j(1 / d_j^p)
 */
export function interpolate23SingaporeTowns(
  horizonForecasts: Record<HorizonKey, RegionHorizonForecast>,
  idwPower = 2.0
): TownInterpolated[] {
  return SINGAPORE_23_TOWNS.map((town) => {
    const rawWeights = {} as Record<RegionKey, number>;
    let weightSum = 0;
    let nearestRegion: RegionKey = 'central';
    let nearestDistanceKm = Infinity;

    for (const key of REGION_KEYS) {
      const regCoord = NEA_REGIONS[key];
      const distKm = haversineDistanceKm(town.lat, town.lng, regCoord.lat, regCoord.lng);
      if (distKm < nearestDistanceKm) {
        nearestDistanceKm = distKm;
        nearestRegion = key;
      }
      const clampedDist = Math.max(0.25, distKm);
      const w = 1 / Math.pow(clampedDist, idwPower);
      rawWeights[key] = w;
      weightSum += w;
    }

    const normalizedWeights = {} as Record<RegionKey, number>;
    for (const key of REGION_KEYS) {
      normalizedWeights[key] = Number((rawWeights[key] / weightSum).toFixed(4));
    }

    const horizons = {} as Record<HorizonKey, TownHorizonMetrics>;
    for (const { key: hKey } of FORECAST_HORIZONS) {
      const forecastStep = horizonForecasts[hKey];
      let pm25Interp = 0;
      let psiInterp = 0;

      for (const rKey of REGION_KEYS) {
        const w = normalizedWeights[rKey];
        pm25Interp += w * forecastStep.regions[rKey].pm25;
        psiInterp += w * forecastStep.regions[rKey].psi24h;
      }

      const pm25Rounded = Math.round(pm25Interp);
      const psiRounded = Math.round(psiInterp);

      horizons[hKey] = {
        pm25: pm25Rounded,
        psi: psiRounded,
        pm25Band: getPm25Band(pm25Rounded),
        psiCategory: getPsiCategory(psiRounded),
      };
    }

    return {
      ...town,
      weights: normalizedWeights,
      nearestRegion,
      nearestDistanceKm: Number(nearestDistanceKm.toFixed(2)),
      horizons,
    };
  });
}

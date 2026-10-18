export type RegionKey = 'north' | 'south' | 'east' | 'west' | 'central';

export type HorizonKey = 'NOW' | '+1h' | '+3h' | '+6h' | '+12h' | '+24h';

export interface RegionCoordinate {
  key: RegionKey;
  label: string;
  stationName: string;
  lat: number;
  lng: number;
}

export interface RegionTelemetry {
  key: RegionKey;
  label: string;
  stationName: string;
  lat: number;
  lng: number;
  pm25: number; // 1-hr PM2.5 in ug/m3
  psi24h: number; // 24-hr PSI
  pm10SubIndex: number;
  pm25SubIndex: number;
  o3SubIndex: number;
  coSubIndex: number;
  so2SubIndex: number;
  no2SubIndex: number;
  pm25History: number[]; // Past 12 hourly readings (oldest to latest)
  psiHistory: number[];  // Past 12 hourly readings (oldest to latest)
}

export interface WeatherStationReading {
  id: string;
  name: string;
  lat: number;
  lng: number;
  windSpeedKnots?: number;
  windDirectionDeg?: number;
  temperatureC?: number;
  humidityPct?: number;
}

export interface MeteorologyState {
  windSpeedKnots: number;
  windSpeedMs: number;
  windDirectionDeg: number; // Meteorological direction wind is blowing FROM (0-360)
  windCardinal: string;
  temperatureC: number;
  humidityPct: number;
  generalForecast: string;
  monsoonRegime: string;
  plumeVectorLabel: string;
  transboundaryRiskFactor: number; // 0.0 to 1.0
  stations: WeatherStationReading[];
}

export interface TownDefinition {
  id: string;
  index: number; // 1 to 23
  name: string;
  planningArea: string;
  regionGroup: 'North' | 'North-East' | 'East' | 'Central' | 'South' | 'West';
  lat: number;
  lng: number;
  population: string;
  elevationM: number;
}

export type Pm25Band = 'Normal' | 'Elevated' | 'High' | 'Very High';
export type PsiCategory = 'Good' | 'Moderate' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';

export interface TownHorizonMetrics {
  pm25: number;
  psi: number;
  pm25Band: Pm25Band;
  psiCategory: PsiCategory;
}

export interface TownInterpolated extends TownDefinition {
  weights: Record<RegionKey, number>;
  nearestRegion: RegionKey;
  nearestDistanceKm: number;
  horizons: Record<HorizonKey, TownHorizonMetrics>;
}

export interface HoltParams {
  alpha: number; // Level smoothing (0.1 - 0.95)
  beta: number;  // Trend smoothing (0.05 - 0.85)
  phi: number;   // Damping coefficient (0.70 - 0.98)
  advectionWeight: number; // Wind advection coupling (0.0 - 2.0)
  idwPower: number; // Inverse Distance Weighting power p (default 2.0)
}

export interface RegionHorizonForecast {
  horizon: HorizonKey;
  hoursAhead: number;
  regions: Record<
    RegionKey,
    {
      pm25: number;
      psi24h: number;
      pm25Lower: number;
      pm25Upper: number;
      psiLower: number;
      psiUpper: number;
      holtTrendComponent: number;
      windAdvectionDelta: number;
      transboundaryFlux: number;
      hygroscopicFactor: number;
    }
  >;
  islandAvgPm25: number;
  islandMaxPm25: number;
  islandAvgPsi: number;
  islandMaxPsi: number;
}

export interface HourlyTrajectoryPoint {
  hourOffset: number; // -11 to 0 (history) and +1 to +24 (forecast)
  label: string;
  isForecast: boolean;
  regions: Record<RegionKey, { pm25: number; psi24h: number }>;
  islandAvgPm25: number;
  islandAvgPsi: number;
}

export interface GeminiForecastReport {
  headline: string;
  alertLevel: 'NOMINAL' | 'ELEVATED WATCH' | 'UNHEALTHY ADVISORY' | 'HAZARDOUS ALERT' | string;
  executiveSummary: string;
  synopticAnalysis: string;
  horizonCommentary: Array<{
    horizon: string;
    expectedPsiRange: string;
    expectedPm25Peak: string;
    physicalDriver: string;
  }>;
  townHotspots: Array<{
    town: string;
    region: string;
    currentPm25: number;
    projected6hPm25: number;
    riskAssessment: string;
  }>;
  healthAdvisories: {
    generalPublic: string;
    sensitiveGroups: string;
    outdoorOperations: string;
  };
  modelConfidence: number;
  primaryUncertaintyFactor: string;
  modelUsed?: string;
  generatedAt?: string;
}

export interface NeaDatasetSnapshot {
  source: 'NEA_V2_LIVE' | 'NEA_V1_LIVE' | 'SCENARIO_SIMULATION';
  scenarioId: string;
  scenarioLabel: string;
  timestamp: string;
  apiLatencyMs: number;
  endpointsStatus: {
    psi: 'OK' | 'FALLBACK' | 'SIM';
    pm25: 'OK' | 'FALLBACK' | 'SIM';
    windSpeed: 'OK' | 'FALLBACK' | 'SIM';
    windDirection: 'OK' | 'FALLBACK' | 'SIM';
    temperature: 'OK' | 'FALLBACK' | 'SIM';
    humidity: 'OK' | 'FALLBACK' | 'SIM';
  };
  regions: Record<RegionKey, RegionTelemetry>;
  meteorology: MeteorologyState;
}

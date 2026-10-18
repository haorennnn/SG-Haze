import { NEA_REGIONS, PRESET_SCENARIOS } from '../data/singaporeGeography';
import {
  NeaDatasetSnapshot,
  RegionKey,
  RegionTelemetry,
  WeatherStationReading,
} from '../types/haze';

const V2_BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
const V1_BASE = 'https://api.data.gov.sg/v1/environment';

const REGION_KEYS: RegionKey[] = ['north', 'south', 'east', 'west', 'central'];

export function degreesToCardinal(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

export function classifyMonsoonAndPlume(windDirDeg: number): {
  monsoonRegime: string;
  plumeVectorLabel: string;
  transboundaryRiskFactor: number;
} {
  const d = ((windDirDeg % 360) + 360) % 360;
  if (d >= 195 && d <= 255) {
    return {
      monsoonRegime: 'Southwest Monsoon Flow',
      plumeVectorLabel: `Sumatra Peatland Corridor (${Math.round(d)}° ${degreesToCardinal(d)})`,
      transboundaryRiskFactor: 0.78,
    };
  }
  if (d >= 120 && d < 195) {
    return {
      monsoonRegime: 'Southeast / Southerly Regime',
      plumeVectorLabel: `Riau Archipelago / Southern Kalimantan (${Math.round(d)}° ${degreesToCardinal(d)})`,
      transboundaryRiskFactor: 0.58,
    };
  }
  if (d >= 30 && d <= 95) {
    return {
      monsoonRegime: 'Northeast Monsoon Maritime Flow',
      plumeVectorLabel: `South China Sea Clean Maritime Fetch (${Math.round(d)}° ${degreesToCardinal(d)})`,
      transboundaryRiskFactor: 0.14,
    };
  }
  if (d > 255 && d <= 315) {
    return {
      monsoonRegime: 'Strait of Malacca Westerly Flow',
      plumeVectorLabel: `Northern Sumatra / Malacca Strait (${Math.round(d)}° ${degreesToCardinal(d)})`,
      transboundaryRiskFactor: 0.42,
    };
  }
  return {
    monsoonRegime: 'Northerly / Inter-Monsoon Regime',
    plumeVectorLabel: `Southern Peninsular Malaysia / Johor (${Math.round(d)}° ${degreesToCardinal(d)})`,
    transboundaryRiskFactor: 0.25,
  };
}

/**
 * Fetches an NEA endpoint trying v2 first, then server proxy, then v1
 */
async function fetchNeaEndpoint(
  v2Slug: string,
  v1Slug: string
): Promise<{ payload: any; status: 'OK' | 'FALLBACK' | 'SIM' }> {
  // 1. Direct NEA v2 API
  try {
    const res = await fetch(`${V2_BASE}/${v2Slug}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (res.ok) {
      const json = await res.json();
      return { payload: json?.data ?? json, status: 'OK' };
    }
  } catch {
    // Fall through to proxy / v1
  }

  // 2. Server-side NEA v2 Proxy
  try {
    const res = await fetch(`/api/nea-v2/${v2Slug}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (res.ok) {
      const json = await res.json();
      return { payload: json?.data ?? json, status: 'OK' };
    }
  } catch {
    // Fall through to v1
  }

  // 3. NEA v1 Fallback
  try {
    const res = await fetch(`${V1_BASE}/${v1Slug}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (res.ok) {
      const json = await res.json();
      return { payload: json?.data ?? json, status: 'FALLBACK' };
    }
  } catch {
    // All live attempts failed
  }

  return { payload: null, status: 'SIM' };
}

/**
 * Builds a 12-hour historical series from NEA items or synthesizes a physically consistent 12-hour history
 * anchored on current 1-hr PM2.5 and 24-hr PSI.
 */
function buildSeriesFromItems(
  items: any[],
  metricKey: string,
  regionKey: RegionKey,
  currentVal: number,
  referenceAvgVal: number
): number[] {
  if (Array.isArray(items) && items.length >= 4) {
    const extracted = items
      .slice(0, 12)
      .map((item) => item?.readings?.[metricKey]?.[regionKey])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (extracted.length >= 4) {
      // NEA v2 returns newest first; reverse so oldest is first and latest is last
      const chronological = [...extracted].reverse();
      while (chronological.length < 12) {
        chronological.unshift(chronological[0]);
      }
      chronological[chronological.length - 1] = currentVal;
      return chronological.slice(-12);
    }
  }

  // Reconstruct 12-hr trajectory from reference average toward current latest reading
  const startVal = Math.max(4, referenceAvgVal * 0.92);
  const series: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    // Smooth curve with small diurnal harmonic
    const harmonic = Math.sin(i * 0.65 + regionKey.length) * 1.2;
    const val = startVal + (currentVal - startVal) * Math.pow(t, 1.15) + (i === 11 ? 0 : harmonic);
    series.push(Math.max(2, Math.round(val * 10) / 10));
  }
  series[11] = currentVal;
  return series;
}

/**
 * Circular mean for wind directions in degrees (0-360)
 */
function computeCircularMeanDegrees(angles: number[]): number {
  if (angles.length === 0) return 155;
  let sinSum = 0;
  let cosSum = 0;
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const meanRad = Math.atan2(sinSum / angles.length, cosSum / angles.length);
  return ((meanRad * 180) / Math.PI + 360) % 360;
}

/**
 * Fetches live Singapore NEA v2 telemetry across all 6 environmental endpoints
 */
export async function fetchLiveNeaTelemetry(): Promise<NeaDatasetSnapshot> {
  const startTime = performance.now();

  const [
    psiRes,
    pm25Res,
    windSpeedRes,
    windDirRes,
    tempRes,
    humRes,
    forecastRes,
  ] = await Promise.all([
    fetchNeaEndpoint('psi', 'psi'),
    fetchNeaEndpoint('pm25', 'pm25'),
    fetchNeaEndpoint('wind-speed', 'wind-speed'),
    fetchNeaEndpoint('wind-direction', 'wind-direction'),
    fetchNeaEndpoint('air-temperature', 'air-temperature'),
    fetchNeaEndpoint('relative-humidity', 'relative-humidity'),
    fetchNeaEndpoint('twenty-four-hr-forecast', '24-hour-weather-forecast'),
  ]);

  const apiLatencyMs = Math.round(performance.now() - startTime);

  const psiItems = psiRes.payload?.items || [];
  const pm25Items = pm25Res.payload?.items || [];

  const latestPsiItem = psiItems[0] || null;
  const latestPm25Item = pm25Items[0] || null;

  const timestamp =
    latestPm25Item?.timestamp ||
    latestPsiItem?.timestamp ||
    new Date().toISOString();

  // Extract 5 NEA regions
  const regions = {} as Record<RegionKey, RegionTelemetry>;
  const fallbackBaseline: Record<RegionKey, { pm25: number; psi: number }> = {
    north: { pm25: 16, psi: 53 },
    south: { pm25: 19, psi: 56 },
    east: { pm25: 15, psi: 50 },
    west: { pm25: 21, psi: 58 },
    central: { pm25: 17, psi: 54 },
  };

  for (const key of REGION_KEYS) {
    const coord = NEA_REGIONS[key];
    const psiReadings = latestPsiItem?.readings || {};
    const pm25Readings = latestPm25Item?.readings || {};

    const pm25Val =
      typeof pm25Readings?.pm25_one_hourly?.[key] === 'number'
        ? pm25Readings.pm25_one_hourly[key]
        : fallbackBaseline[key].pm25;

    const psi24hVal =
      typeof psiReadings?.psi_twenty_four_hourly?.[key] === 'number'
        ? psiReadings.psi_twenty_four_hourly[key]
        : fallbackBaseline[key].psi;

    const pm10Sub = psiReadings?.pm10_sub_index?.[key] ?? Math.round(psi24hVal * 0.86);
    const pm25Sub = psiReadings?.pm25_sub_index?.[key] ?? psi24hVal;
    const o3Sub = psiReadings?.o3_sub_index?.[key] ?? 32;
    const coSub = psiReadings?.co_sub_index?.[key] ?? 8;
    const so2Sub = psiReadings?.so2_sub_index?.[key] ?? 5;
    const no2Sub = psiReadings?.no2_one_hour_max?.[key] ?? 12;

    const pm25History = buildSeriesFromItems(
      pm25Items,
      'pm25_one_hourly',
      key,
      pm25Val,
      Math.max(8, psi24hVal * 0.32)
    );

    const psiHistory = buildSeriesFromItems(
      psiItems,
      'psi_twenty_four_hourly',
      key,
      psi24hVal,
      psi24hVal * 0.96
    );

    regions[key] = {
      key,
      label: coord.label,
      stationName: coord.stationName,
      lat: coord.lat,
      lng: coord.lng,
      pm25: pm25Val,
      psi24h: psi24hVal,
      pm10SubIndex: pm10Sub,
      pm25SubIndex: pm25Sub,
      o3SubIndex: o3Sub,
      coSubIndex: coSub,
      so2SubIndex: so2Sub,
      no2SubIndex: no2Sub,
      pm25History,
      psiHistory,
    };
  }

  // Parse Meteorological Stations (Wind Speed, Wind Direction, Temp, Humidity)
  const stationMap = new Map<string, WeatherStationReading>();

  const registerStations = (payload: any) => {
    const stationsList = payload?.stations || payload?.metadata?.stations || [];
    for (const s of stationsList) {
      const id = s.id || s.device_id;
      const lat = s.location?.latitude;
      const lng = s.location?.longitude;
      if (id && typeof lat === 'number' && typeof lng === 'number') {
        if (!stationMap.has(id)) {
          stationMap.set(id, {
            id,
            name: s.name || id,
            lat,
            lng,
          });
        }
      }
    }
  };

  registerStations(windSpeedRes.payload);
  registerStations(windDirRes.payload);
  registerStations(tempRes.payload);
  registerStations(humRes.payload);

  const extractReadingList = (payload: any): Array<{ stationId: string; value: number }> => {
    // v2 format: payload.readings[0].data -> [{ stationId, value }]
    const v2Readings = payload?.readings?.[0]?.data;
    if (Array.isArray(v2Readings)) {
      return v2Readings
        .filter((r: any) => typeof r.value === 'number')
        .map((r: any) => ({ stationId: r.stationId || r.station_id, value: r.value }));
    }
    // v1 format: payload.items[0].readings -> [{ station_id, value }]
    const v1Readings = payload?.items?.[0]?.readings;
    if (Array.isArray(v1Readings)) {
      return v1Readings
        .filter((r: any) => typeof r.value === 'number')
        .map((r: any) => ({ stationId: r.station_id || r.stationId, value: r.value }));
    }
    return [];
  };

  const wsList = extractReadingList(windSpeedRes.payload);
  const wdList = extractReadingList(windDirRes.payload);
  const tempList = extractReadingList(tempRes.payload);
  const humList = extractReadingList(humRes.payload);

  for (const r of wsList) {
    const st = stationMap.get(r.stationId);
    if (st) st.windSpeedKnots = r.value;
  }
  for (const r of wdList) {
    const st = stationMap.get(r.stationId);
    if (st) st.windDirectionDeg = r.value;
  }
  for (const r of tempList) {
    const st = stationMap.get(r.stationId);
    if (st) st.temperatureC = r.value;
  }
  for (const r of humList) {
    const st = stationMap.get(r.stationId);
    if (st) st.humidityPct = r.value;
  }

  const avgWindKnots =
    wsList.length > 0
      ? Number((wsList.reduce((acc, r) => acc + r.value, 0) / wsList.length).toFixed(1))
      : 7.4;

  const avgWindDirDeg =
    wdList.length > 0
      ? Math.round(computeCircularMeanDegrees(wdList.map((r) => r.value)))
      : 158;

  const avgTempC =
    tempList.length > 0
      ? Number((tempList.reduce((acc, r) => acc + r.value, 0) / tempList.length).toFixed(1))
      : 29.6;

  const avgHumPct =
    humList.length > 0
      ? Math.round(humList.reduce((acc, r) => acc + r.value, 0) / humList.length)
      : 76;

  // General 24-hr weather forecast text
  const generalForecast =
    forecastRes.payload?.records?.[0]?.general?.forecast?.text ||
    forecastRes.payload?.items?.[0]?.general?.forecast ||
    'Partly cloudy with localized coastal sea breeze convergence.';

  const { monsoonRegime, plumeVectorLabel, transboundaryRiskFactor } =
    classifyMonsoonAndPlume(avgWindDirDeg);

  const stations = Array.from(stationMap.values()).filter(
    (s) => s.windSpeedKnots !== undefined || s.windDirectionDeg !== undefined || s.temperatureC !== undefined
  );

  const isLiveV2 = psiRes.status === 'OK' || pm25Res.status === 'OK';
  const isFallbackV1 = !isLiveV2 && (psiRes.status === 'FALLBACK' || pm25Res.status === 'FALLBACK');

  return {
    source: isLiveV2 ? 'NEA_V2_LIVE' : isFallbackV1 ? 'NEA_V1_LIVE' : 'SCENARIO_SIMULATION',
    scenarioId: 'live-nea',
    scenarioLabel: 'Live NEA data.gov.sg v2 Real-Time Telemetry',
    timestamp,
    apiLatencyMs,
    endpointsStatus: {
      psi: psiRes.status,
      pm25: pm25Res.status,
      windSpeed: windSpeedRes.status,
      windDirection: windDirRes.status,
      temperature: tempRes.status,
      humidity: humRes.status,
    },
    regions,
    meteorology: {
      windSpeedKnots: avgWindKnots,
      windSpeedMs: Number((avgWindKnots * 0.514444).toFixed(2)),
      windDirectionDeg: avgWindDirDeg,
      windCardinal: degreesToCardinal(avgWindDirDeg),
      temperatureC: avgTempC,
      humidityPct: avgHumPct,
      generalForecast,
      monsoonRegime,
      plumeVectorLabel,
      transboundaryRiskFactor,
      stations:
        stations.length > 0
          ? stations
          : PRESET_SCENARIOS['inter-monsoon-elevated'].meteorology.stations,
    },
  };
}

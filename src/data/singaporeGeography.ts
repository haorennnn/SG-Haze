import { RegionCoordinate, RegionKey, TownDefinition, NeaDatasetSnapshot } from '../types/haze';

// Map geographic bounding box for coordinate projection
export const SG_BOUNDS = {
  minLat: 1.225,
  maxLat: 1.475,
  minLng: 103.605,
  maxLng: 104.055,
  svgWidth: 960,
  svgHeight: 540,
};

/**
 * Projects geographic (lat, lng) into tactical SVG canvas (x, y)
 */
export function projectLatLngToSvg(lat: number, lng: number): { x: number; y: number } {
  const xRatio = (lng - SG_BOUNDS.minLng) / (SG_BOUNDS.maxLng - SG_BOUNDS.minLng);
  const yRatio = 1 - (lat - SG_BOUNDS.minLat) / (SG_BOUNDS.maxLat - SG_BOUNDS.minLat);
  return {
    x: Number((xRatio * SG_BOUNDS.svgWidth).toFixed(1)),
    y: Number((yRatio * SG_BOUNDS.svgHeight).toFixed(1)),
  };
}

/**
 * Inverse projection from SVG canvas (x, y) back to geographic (lat, lng)
 */
export function unprojectSvgToLatLng(x: number, y: number): { lat: number; lng: number } {
  const lng = SG_BOUNDS.minLng + (x / SG_BOUNDS.svgWidth) * (SG_BOUNDS.maxLng - SG_BOUNDS.minLng);
  const lat = SG_BOUNDS.maxLat - (y / SG_BOUNDS.svgHeight) * (SG_BOUNDS.maxLat - SG_BOUNDS.minLat);
  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
  };
}

// 5 Official NEA Regional Air Quality Anchors
export const NEA_REGIONS: Record<RegionKey, RegionCoordinate> = {
  north: {
    key: 'north',
    label: 'North Region',
    stationName: 'Woodlands / Sembawang NEA',
    lat: 1.41803,
    lng: 103.8200,
  },
  south: {
    key: 'south',
    label: 'South Region',
    stationName: 'Sentosa / Marina South NEA',
    lat: 1.29587,
    lng: 103.8200,
  },
  east: {
    key: 'east',
    label: 'East Region',
    stationName: 'Tampines / Changi NEA',
    lat: 1.35735,
    lng: 103.9400,
  },
  west: {
    key: 'west',
    label: 'West Region',
    stationName: 'Jurong West / Boon Lay NEA',
    lat: 1.35735,
    lng: 103.7000,
  },
  central: {
    key: 'central',
    label: 'Central Region',
    stationName: 'Bishan / Toa Payoh NEA',
    lat: 1.35735,
    lng: 103.8200,
  },
};

// All 23 Singapore Towns for Inverse Distance Weighting (IDW) Spatial Interpolation
export const SINGAPORE_23_TOWNS: TownDefinition[] = [
  {
    id: 'woodlands',
    index: 1,
    name: 'Woodlands',
    planningArea: 'Woodlands Regional Centre',
    regionGroup: 'North',
    lat: 1.4382,
    lng: 103.7890,
    population: '255,100',
    elevationM: 26,
  },
  {
    id: 'sembawang',
    index: 2,
    name: 'Sembawang',
    planningArea: 'Sembawang North',
    regionGroup: 'North',
    lat: 1.4491,
    lng: 103.8185,
    population: '108,200',
    elevationM: 18,
  },
  {
    id: 'yishun',
    index: 3,
    name: 'Yishun',
    planningArea: 'Lower Seletar / Yishun',
    regionGroup: 'North',
    lat: 1.4304,
    lng: 103.8354,
    population: '222,500',
    elevationM: 21,
  },
  {
    id: 'ang-mo-kio',
    index: 4,
    name: 'Ang Mo Kio',
    planningArea: 'Ang Mo Kio Town',
    regionGroup: 'North-East',
    lat: 1.3691,
    lng: 103.8454,
    population: '162,300',
    elevationM: 34,
  },
  {
    id: 'sengkang',
    index: 5,
    name: 'Sengkang',
    planningArea: 'Sungei Serangoon',
    regionGroup: 'North-East',
    lat: 1.3868,
    lng: 103.8914,
    population: '253,100',
    elevationM: 19,
  },
  {
    id: 'punggol',
    index: 6,
    name: 'Punggol',
    planningArea: 'Punggol Digital District',
    regionGroup: 'North-East',
    lat: 1.3984,
    lng: 103.9072,
    population: '188,600',
    elevationM: 14,
  },
  {
    id: 'hougang',
    index: 7,
    name: 'Hougang',
    planningArea: 'Hougang Central',
    regionGroup: 'North-East',
    lat: 1.3612,
    lng: 103.8863,
    population: '227,500',
    elevationM: 22,
  },
  {
    id: 'serangoon',
    index: 8,
    name: 'Serangoon',
    planningArea: 'Serangoon Gardens / Nex',
    regionGroup: 'North-East',
    lat: 1.3554,
    lng: 103.8679,
    population: '116,900',
    elevationM: 25,
  },
  {
    id: 'pasir-ris',
    index: 9,
    name: 'Pasir Ris',
    planningArea: 'Pasir Ris Coast',
    regionGroup: 'East',
    lat: 1.3721,
    lng: 103.9474,
    population: '147,100',
    elevationM: 15,
  },
  {
    id: 'tampines',
    index: 10,
    name: 'Tampines',
    planningArea: 'Tampines Regional Centre',
    regionGroup: 'East',
    lat: 1.3496,
    lng: 103.9568,
    population: '265,300',
    elevationM: 28,
  },
  {
    id: 'bedok',
    index: 11,
    name: 'Bedok',
    planningArea: 'Bedok Reservoir / East Coast',
    regionGroup: 'East',
    lat: 1.3236,
    lng: 103.9273,
    population: '276,900',
    elevationM: 24,
  },
  {
    id: 'changi',
    index: 12,
    name: 'Changi',
    planningArea: 'Changi Aviation Met Station',
    regionGroup: 'East',
    lat: 1.3644,
    lng: 103.9915,
    population: '18,400',
    elevationM: 12,
  },
  {
    id: 'bishan',
    index: 13,
    name: 'Bishan',
    planningArea: 'Bishan-Ang Mo Kio Park',
    regionGroup: 'Central',
    lat: 1.3526,
    lng: 103.8352,
    population: '87,300',
    elevationM: 31,
  },
  {
    id: 'toa-payoh',
    index: 14,
    name: 'Toa Payoh',
    planningArea: 'Toa Payoh Central',
    regionGroup: 'Central',
    lat: 1.3343,
    lng: 103.8563,
    population: '128,400',
    elevationM: 29,
  },
  {
    id: 'kallang',
    index: 15,
    name: 'Kallang / Geylang',
    planningArea: 'Kallang Basin',
    regionGroup: 'Central',
    lat: 1.3100,
    lng: 103.8651,
    population: '151,200',
    elevationM: 11,
  },
  {
    id: 'novena',
    index: 16,
    name: 'Novena',
    planningArea: 'Novena Medical Hub',
    regionGroup: 'Central',
    lat: 1.3204,
    lng: 103.8438,
    population: '50,600',
    elevationM: 27,
  },
  {
    id: 'orchard',
    index: 17,
    name: 'Orchard / Tanglin',
    planningArea: 'Orchard Corridor',
    regionGroup: 'Central',
    lat: 1.3048,
    lng: 103.8318,
    population: '24,800',
    elevationM: 23,
  },
  {
    id: 'bukit-timah',
    index: 18,
    name: 'Bukit Timah',
    planningArea: 'Bukit Timah Nature Reserve',
    regionGroup: 'Central',
    lat: 1.3294,
    lng: 103.8021,
    population: '77,800',
    elevationM: 68,
  },
  {
    id: 'marina-bay',
    index: 19,
    name: 'Marina Bay / Downtown',
    planningArea: 'Central Business District',
    regionGroup: 'South',
    lat: 1.2789,
    lng: 103.8536,
    population: '32,500',
    elevationM: 8,
  },
  {
    id: 'queenstown',
    index: 20,
    name: 'Queenstown / Bukit Merah',
    planningArea: 'Southern Ridges',
    regionGroup: 'South',
    lat: 1.2942,
    lng: 103.7861,
    population: '149,800',
    elevationM: 32,
  },
  {
    id: 'clementi',
    index: 21,
    name: 'Clementi',
    planningArea: 'Clementi Woods / Dover',
    regionGroup: 'West',
    lat: 1.3162,
    lng: 103.7649,
    population: '92,400',
    elevationM: 27,
  },
  {
    id: 'jurong-east',
    index: 22,
    name: 'Jurong / Boon Lay',
    planningArea: 'Jurong Lake District',
    regionGroup: 'West',
    lat: 1.3329,
    lng: 103.7436,
    population: '262,700',
    elevationM: 22,
  },
  {
    id: 'choa-chu-kang',
    index: 23,
    name: 'Choa Chu Kang / Bukit Batok',
    planningArea: 'Western Catchment Fringe',
    regionGroup: 'West',
    lat: 1.3840,
    lng: 103.7470,
    population: '192,100',
    elevationM: 35,
  },
];

// High-detail geographic coastline coordinates (lat, lng) for Singapore Mainland & Islands
export const SINGAPORE_MAINLAND_COORDS: Array<[number, number]> = [
  [1.448, 103.770], // Woodlands / Kranji NW
  [1.452, 103.795], // Woodlands Checkpoint
  [1.464, 103.816], // Senoko / Sembawang North tip
  [1.458, 103.838], // Sembawang Park
  [1.439, 103.852], // Yishun Dam
  [1.422, 103.872], // Seletar Aerospace
  [1.415, 103.902], // Punggol North Point
  [1.404, 103.922], // Coney Island / Punggol East
  [1.388, 103.938], // Lorong Halus / Pasir Ris West
  [1.381, 103.964], // Loyang
  [1.391, 103.988], // Changi Point
  [1.378, 104.006], // Changi Beach East
  [1.345, 104.022], // Changi East Terminal 5 Coast
  [1.316, 104.010], // Tanah Merah Ferry Terminal
  [1.310, 103.962], // East Coast Park Bedok
  [1.298, 103.912], // Marine Parade
  [1.288, 103.878], // Marina Barrage / Gardens by the Bay East
  [1.270, 103.864], // Marina South Pier
  [1.263, 103.836], // Keppel / HarbourFront
  [1.268, 103.806], // Labrador Park
  [1.282, 103.776], // Pasir Panjang Terminal
  [1.300, 103.752], // Pandan Reservoir Coast
  [1.304, 103.715], // Jurong Port
  [1.295, 103.672], // Pioneer / Gul Channel
  [1.260, 103.635], // Tuas South View
  [1.242, 103.615], // Tuas Mega Port Southern Tip
  [1.278, 103.612], // Tuas West Coast
  [1.335, 103.632], // Tuas Second Link
  [1.372, 103.658], // Tengah / Western Water Catchment
  [1.415, 103.682], // Sarimbun / Lim Chu Kang
  [1.442, 103.716], // Sungei Buloh Wetland Reserve
  [1.445, 103.748], // Kranji Reservoir
];

export const JURONG_ISLAND_COORDS: Array<[number, number]> = [
  [1.286, 103.678],
  [1.289, 103.718],
  [1.265, 103.732],
  [1.246, 103.692],
  [1.258, 103.662],
];

export const SENTOSA_COORDS: Array<[number, number]> = [
  [1.258, 103.812],
  [1.255, 103.842],
  [1.240, 103.845],
  [1.246, 103.810],
];

export const PULAU_UBIN_COORDS: Array<[number, number]> = [
  [1.418, 103.938],
  [1.422, 103.985],
  [1.404, 103.996],
  [1.402, 103.952],
];

export const PULAU_TEKONG_COORDS: Array<[number, number]> = [
  [1.428, 104.015],
  [1.432, 104.050],
  [1.390, 104.052],
  [1.386, 104.018],
];

export const CENTRAL_CATCHMENT_COORDS: Array<[number, number]> = [
  [1.405, 103.776],
  [1.412, 103.815],
  [1.375, 103.828],
  [1.345, 103.812],
  [1.352, 103.775],
];

export function coordsToSvgPath(coords: Array<[number, number]>, close = true): string {
  if (coords.length === 0) return '';
  const pts = coords.map(([lat, lng]) => projectLatLngToSvg(lat, lng));
  const d = pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  return close ? `${d} Z` : d;
}

// Calibrated Scenarios (when user toggles between Live NEA v2 Feed and Historical Haze Simulation Benchmarks)
export const PRESET_SCENARIOS: Record<string, NeaDatasetSnapshot> = {
  'sw-monsoon-crisis': {
    source: 'SCENARIO_SIMULATION',
    scenarioId: 'sw-monsoon-crisis',
    scenarioLabel: 'SW Monsoon Transboundary Plume (Sumatra Surge)',
    timestamp: new Date().toISOString(),
    apiLatencyMs: 14,
    endpointsStatus: {
      psi: 'SIM',
      pm25: 'SIM',
      windSpeed: 'SIM',
      windDirection: 'SIM',
      temperature: 'SIM',
      humidity: 'SIM',
    },
    regions: {
      west: {
        key: 'west',
        label: 'West Region',
        stationName: 'Jurong West / Boon Lay NEA',
        lat: 1.35735,
        lng: 103.70,
        pm25: 148,
        psi24h: 174,
        pm10SubIndex: 138,
        pm25SubIndex: 174,
        o3SubIndex: 54,
        coSubIndex: 18,
        so2SubIndex: 14,
        no2SubIndex: 28,
        pm25History: [68, 74, 82, 91, 98, 106, 114, 121, 129, 136, 142, 148],
        psiHistory: [98, 104, 112, 120, 128, 136, 144, 151, 158, 164, 169, 174],
      },
      south: {
        key: 'south',
        label: 'South Region',
        stationName: 'Sentosa / Marina South NEA',
        lat: 1.29587,
        lng: 103.82,
        pm25: 136,
        psi24h: 162,
        pm10SubIndex: 129,
        pm25SubIndex: 162,
        o3SubIndex: 51,
        coSubIndex: 17,
        so2SubIndex: 15,
        no2SubIndex: 26,
        pm25History: [62, 69, 76, 84, 92, 99, 107, 115, 121, 127, 132, 136],
        psiHistory: [92, 98, 105, 112, 120, 127, 135, 142, 148, 153, 158, 162],
      },
      central: {
        key: 'central',
        label: 'Central Region',
        stationName: 'Bishan / Toa Payoh NEA',
        lat: 1.35735,
        lng: 103.82,
        pm25: 118,
        psi24h: 146,
        pm10SubIndex: 118,
        pm25SubIndex: 146,
        o3SubIndex: 49,
        coSubIndex: 15,
        so2SubIndex: 12,
        no2SubIndex: 24,
        pm25History: [54, 59, 65, 72, 79, 86, 93, 99, 104, 109, 114, 118],
        psiHistory: [84, 89, 95, 101, 108, 115, 121, 127, 133, 138, 142, 146],
      },
      north: {
        key: 'north',
        label: 'North Region',
        stationName: 'Woodlands / Sembawang NEA',
        lat: 1.41803,
        lng: 103.82,
        pm25: 96,
        psi24h: 124,
        pm10SubIndex: 102,
        pm25SubIndex: 124,
        o3SubIndex: 46,
        coSubIndex: 14,
        so2SubIndex: 11,
        no2SubIndex: 22,
        pm25History: [46, 50, 55, 60, 65, 71, 76, 81, 85, 89, 93, 96],
        psiHistory: [76, 80, 84, 89, 94, 99, 104, 109, 113, 117, 121, 124],
      },
      east: {
        key: 'east',
        label: 'East Region',
        stationName: 'Tampines / Changi NEA',
        lat: 1.35735,
        lng: 103.94,
        pm25: 88,
        psi24h: 115,
        pm10SubIndex: 96,
        pm25SubIndex: 115,
        o3SubIndex: 48,
        coSubIndex: 13,
        so2SubIndex: 10,
        no2SubIndex: 21,
        pm25History: [42, 46, 51, 56, 61, 66, 70, 74, 78, 82, 85, 88],
        psiHistory: [70, 74, 78, 83, 87, 92, 96, 101, 105, 109, 112, 115],
      },
    },
    meteorology: {
      windSpeedKnots: 11.4,
      windSpeedMs: 5.86,
      windDirectionDeg: 218, // SW from central/southern Sumatra
      windCardinal: 'SW',
      temperatureC: 31.8,
      humidityPct: 78,
      generalForecast: 'Hazy and warm with persistent Southwest winds carrying transboundary peatland smoke.',
      monsoonRegime: 'Southwest Monsoon (Dry Phase)',
      plumeVectorLabel: 'Riau / Jambi Sumatra Corridor (218° SW)',
      transboundaryRiskFactor: 0.88,
      stations: [
        { id: 'S44', name: 'Jurong West', lat: 1.3455, lng: 103.6806, windSpeedKnots: 12.6, windDirectionDeg: 222, temperatureC: 32.1, humidityPct: 76 },
        { id: 'S60', name: 'Sentosa', lat: 1.2500, lng: 103.8279, windSpeedKnots: 13.1, windDirectionDeg: 215, temperatureC: 31.4, humidityPct: 81 },
        { id: 'S24', name: 'Changi', lat: 1.3678, lng: 103.9826, windSpeedKnots: 10.2, windDirectionDeg: 212, temperatureC: 31.6, humidityPct: 79 },
        { id: 'S104', name: 'Woodlands', lat: 1.4439, lng: 103.7854, windSpeedKnots: 9.8, windDirectionDeg: 224, temperatureC: 32.0, humidityPct: 75 },
      ],
    },
  },
  'inter-monsoon-elevated': {
    source: 'SCENARIO_SIMULATION',
    scenarioId: 'inter-monsoon-elevated',
    scenarioLabel: 'Dry Inter-Monsoon SE Plume (Moderate-Unhealthy)',
    timestamp: new Date().toISOString(),
    apiLatencyMs: 12,
    endpointsStatus: {
      psi: 'SIM',
      pm25: 'SIM',
      windSpeed: 'SIM',
      windDirection: 'SIM',
      temperature: 'SIM',
      humidity: 'SIM',
    },
    regions: {
      east: {
        key: 'east',
        label: 'East Region',
        stationName: 'Tampines / Changi NEA',
        lat: 1.35735,
        lng: 103.94,
        pm25: 68,
        psi24h: 98,
        pm10SubIndex: 84,
        pm25SubIndex: 98,
        o3SubIndex: 58,
        coSubIndex: 11,
        so2SubIndex: 9,
        no2SubIndex: 19,
        pm25History: [38, 41, 44, 47, 50, 53, 56, 59, 62, 64, 66, 68],
        psiHistory: [72, 74, 77, 80, 82, 85, 88, 90, 93, 95, 97, 98],
      },
      south: {
        key: 'south',
        label: 'South Region',
        stationName: 'Sentosa / Marina South NEA',
        lat: 1.29587,
        lng: 103.82,
        pm25: 62,
        psi24h: 92,
        pm10SubIndex: 79,
        pm25SubIndex: 92,
        o3SubIndex: 55,
        coSubIndex: 12,
        so2SubIndex: 10,
        no2SubIndex: 21,
        pm25History: [35, 38, 40, 43, 46, 49, 52, 55, 57, 59, 61, 62],
        psiHistory: [68, 70, 73, 75, 78, 80, 83, 85, 88, 90, 91, 92],
      },
      central: {
        key: 'central',
        label: 'Central Region',
        stationName: 'Bishan / Toa Payoh NEA',
        lat: 1.35735,
        lng: 103.82,
        pm25: 54,
        psi24h: 84,
        pm10SubIndex: 72,
        pm25SubIndex: 84,
        o3SubIndex: 52,
        coSubIndex: 11,
        so2SubIndex: 8,
        no2SubIndex: 18,
        pm25History: [31, 33, 35, 38, 40, 43, 45, 47, 49, 51, 53, 54],
        psiHistory: [62, 64, 66, 68, 71, 73, 75, 78, 80, 82, 83, 84],
      },
      north: {
        key: 'north',
        label: 'North Region',
        stationName: 'Woodlands / Sembawang NEA',
        lat: 1.41803,
        lng: 103.82,
        pm25: 44,
        psi24h: 74,
        pm10SubIndex: 64,
        pm25SubIndex: 74,
        o3SubIndex: 49,
        coSubIndex: 10,
        so2SubIndex: 7,
        no2SubIndex: 16,
        pm25History: [26, 28, 30, 32, 34, 35, 37, 39, 40, 42, 43, 44],
        psiHistory: [55, 57, 59, 61, 63, 65, 67, 69, 71, 72, 73, 74],
      },
      west: {
        key: 'west',
        label: 'West Region',
        stationName: 'Jurong West / Boon Lay NEA',
        lat: 1.35735,
        lng: 103.70,
        pm25: 39,
        psi24h: 69,
        pm10SubIndex: 60,
        pm25SubIndex: 69,
        o3SubIndex: 47,
        coSubIndex: 10,
        so2SubIndex: 8,
        no2SubIndex: 17,
        pm25History: [24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39],
        psiHistory: [52, 54, 55, 57, 59, 61, 63, 64, 66, 67, 68, 69],
      },
    },
    meteorology: {
      windSpeedKnots: 6.8,
      windSpeedMs: 3.5,
      windDirectionDeg: 142, // SE
      windCardinal: 'SE',
      temperatureC: 30.9,
      humidityPct: 81,
      generalForecast: 'Slightly hazy with light Southeast winds and sluggish boundary-layer mixing.',
      monsoonRegime: 'Inter-Monsoon Convergence',
      plumeVectorLabel: 'Southern Kalimantan / Lingga Basin (142° SE)',
      transboundaryRiskFactor: 0.56,
      stations: [
        { id: 'S24', name: 'Changi', lat: 1.3678, lng: 103.9826, windSpeedKnots: 7.9, windDirectionDeg: 138, temperatureC: 30.8, humidityPct: 82 },
        { id: 'S60', name: 'Sentosa', lat: 1.2500, lng: 103.8279, windSpeedKnots: 7.4, windDirectionDeg: 145, temperatureC: 30.6, humidityPct: 84 },
        { id: 'S44', name: 'Jurong West', lat: 1.3455, lng: 103.6806, windSpeedKnots: 5.8, windDirectionDeg: 148, temperatureC: 31.2, humidityPct: 78 },
        { id: 'S104', name: 'Woodlands', lat: 1.4439, lng: 103.7854, windSpeedKnots: 6.1, windDirectionDeg: 139, temperatureC: 31.0, humidityPct: 80 },
      ],
    },
  },
};

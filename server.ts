import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Initialize GoogleGenAI with process.env.GEMINI_API_KEY
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Optional NEA data.gov.sg v2 server-side proxy for resilience
app.get('/api/nea-v2/:endpoint', async (req, res) => {
  const { endpoint } = req.params;
  const allowed = new Set([
    'psi',
    'pm25',
    'wind-speed',
    'wind-direction',
    'air-temperature',
    'relative-humidity',
    'twenty-four-hr-forecast',
    'two-hr-forecast',
  ]);
  if (!allowed.has(endpoint)) {
    res.status(400).json({ error: 'Invalid NEA endpoint' });
    return;
  }

  try {
    const v2Url = `https://api-open.data.gov.sg/v2/real-time/api/${endpoint}`;
    const response = await fetch(v2Url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`NEA v2 returned HTTP ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'NEA proxy fetch failed';
    res.status(502).json({ error: message });
  }
});

// Gemini AI Forecast endpoint using built-in process.env.GEMINI_API_KEY
app.post('/api/gemini-forecast', async (req, res) => {
  try {
    const ai = getAiClient();
    const {
      regions,
      meteorology,
      forecasts,
      towns,
      selectedTown,
      holtParams,
      scenarioLabel,
      timestamp,
    } = req.body;

    const systemInstruction = `You are the Chief Atmospheric & Transboundary Haze Forecaster for the Singapore Haze Command Center (National Environment Agency / Meteorological Service Singapore standards).
Analyze the live 5-region NEA PM2.5 & 24-hr PSI telemetry, 23-town Inverse Distance Weighting (IDW) spatial grid, prevailing wind vector advection, and the Holt Double Exponential Smoothing + Wind Advection forecasts across +1h, +3h, +6h, +12h, and +24h horizons.
Provide a rigorous, calibrated, quantitative meteorological and air quality forecast briefing suitable for civil defense, public health, and environmental operations in Singapore.
Do not use markdown formatting inside JSON string fields. Cite exact numeric values (ug/m3, PSI, knots, degrees, town names).`;

    const prompt = JSON.stringify({
      task: 'Generate a comprehensive Singapore Haze & Atmospheric Dispersion Forecast Report',
      observationTimestamp: timestamp,
      activeScenario: scenarioLabel || 'Live NEA Telemetry',
      selectedFocusTown: selectedTown || 'Islandwide Singapore',
      holtEngineParameters: holtParams,
      nea5RegionTelemetry: regions,
      meteorologicalState: meteorology,
      holtWindAdvectionForecasts: forecasts,
      interpolated23SingaporeTowns: towns,
    });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        headline: {
          type: Type.STRING,
          description: 'Concise 1-sentence authoritative meteorological headline for Singapore.',
        },
        alertLevel: {
          type: Type.STRING,
          description: 'One of: NOMINAL, ELEVATED WATCH, UNHEALTHY ADVISORY, HAZARDOUS ALERT',
        },
        executiveSummary: {
          type: Type.STRING,
          description: '2-3 sentence quantitative synthesis of current PM2.5, 24-hr PSI, wind advection vector, and 24-hour trajectory.',
        },
        synopticAnalysis: {
          type: Type.STRING,
          description: 'Technical analysis of wind bearing, monsoon regime, transboundary plume corridor (Sumatra/Kalimantan/Johor/SCS), and humidity/dispersion physics.',
        },
        horizonCommentary: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              horizon: { type: Type.STRING, description: '+1h, +3h, +6h, +12h, or +24h' },
              expectedPsiRange: { type: Type.STRING, description: 'Expected PSI range across regions, e.g. 52-68 PSI' },
              expectedPm25Peak: { type: Type.STRING, description: 'Peak region and PM2.5 in ug/m3' },
              physicalDriver: { type: Type.STRING, description: 'Specific advection, Holt trend, or boundary-layer driver for this horizon' },
            },
            required: ['horizon', 'expectedPsiRange', 'expectedPm25Peak', 'physicalDriver'],
          },
        },
        townHotspots: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              town: { type: Type.STRING },
              region: { type: Type.STRING },
              currentPm25: { type: Type.NUMBER },
              projected6hPm25: { type: Type.NUMBER },
              riskAssessment: { type: Type.STRING },
            },
            required: ['town', 'region', 'currentPm25', 'projected6hPm25', 'riskAssessment'],
          },
        },
        healthAdvisories: {
          type: Type.OBJECT,
          properties: {
            generalPublic: { type: Type.STRING },
            sensitiveGroups: { type: Type.STRING },
            outdoorOperations: { type: Type.STRING },
          },
          required: ['generalPublic', 'sensitiveGroups', 'outdoorOperations'],
        },
        modelConfidence: {
          type: Type.NUMBER,
          description: 'Confidence score from 0 to 100',
        },
        primaryUncertaintyFactor: {
          type: Type.STRING,
          description: 'Main meteorological source of forecast variance (e.g. sea breeze convergence, convective shower washout)',
        },
      },
      required: [
        'headline',
        'alertLevel',
        'executiveSummary',
        'synopticAnalysis',
        'horizonCommentary',
        'townHotspots',
        'healthAdvisories',
        'modelConfidence',
        'primaryUncertaintyFactor',
      ],
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini model');
    }
    const parsed = JSON.parse(text);
    res.json({
      ...parsed,
      modelUsed: 'gemini-3.8-flash',
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Gemini forecast error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate Gemini AI forecast';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Singapore Haze Command Center running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

# SGHaze

A real-time Singapore air quality and haze monitoring dashboard. It combines live **data.gov.sg v2** telemetry with town-level spatial interpolation and Gemini 2.5 Flash forecasting.

Deployed live on Google Cloud Run via Google AI Studio.

---

## What It Does

- **Real-Time NEA Telemetry:** Pulls live 24-hr rolling PSI, 1-hr PM2.5, wind speed, wind direction, and relative humidity across Singapore.
- **Town-Level Granularity:** Uses Inverse Distance Weighting across the 5 NEA centroids to estimate air quality for 23 local planning areas (e.g., Woodlands, Tampines, Jurong West).
- **Interactive Map:** Visualizes regional plumes and directional wind vectors.
- **Predictive Forecasts:** Projects +1h to +24h haze trends using wind advection and trend momentum, synthesized into plain-English advice via Gemini 2.5 Flash.

---

## Live Data Sources

All telemetry is fetched directly from Singapore's official public `data.gov.sg` v2 APIs:

| Metric | Endpoint |
|---|---|
| **24-Hour PSI** | `https://api-open.data.gov.sg/v2/real-time/api/psi` |
| **1-Hour PM2.5** | `https://api-open.data.gov.sg/v2/real-time/api/pm25` |
| **Wind Speed** | `https://api-open.data.gov.sg/v2/real-time/api/wind-speed` |
| **Wind Direction** | `https://api-open.data.gov.sg/v2/real-time/api/wind-direction` |
| **Relative Humidity** | `https://api-open.data.gov.sg/v2/real-time/api/relative-humidity` |

---

## Local Development

### 1. Clone the repo
```bash
git clone [https://github.com/haorennnn/SG-Haze.git](https://github.com/haorennnn/SG-Haze.git)
cd SG-Haze
npm install

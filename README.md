# EcoRoute Fleet Console

A sustainable-logistics web prototype: eco-route optimisation, live carbon analytics, fleet status, and trip simulation, with a Fleet Manager and Driver Companion mode.

Static site. No build step, no backend, no API keys.

## Features

- **KPI cards**: carbon saved, fuel saved, energy efficiency gain, active fleet.
- **Leaflet map**: delivery routes (eco vs. standard dashed), hub, delivery stops, EV chargers.
- **Route optimisation sliders**: payload weight, elevation impact, traffic avoidance, EV preference. Every change recalculates routes, emissions and KPIs.
- **Fleet cards**: EV battery %, cargo load, operational status, route length.
- **Carbon analytics**: kg CO₂ per vehicle, diesel baseline vs. eco route.
- **Trip simulator**: play / pause / reset, animated vehicle along the eco route, with remaining distance, battery and next stop.
- **Driver Companion**: mobile-first turn-by-turn view of the same trip, toggled from the header.

## Run locally

Open `index.html` in a browser. Leaflet and map tiles load from CDNs, so an internet connection is needed.

Or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a repository and push these files to the root of the default branch.
2. In the repo go to **Settings → Pages**.
3. Under **Build and deployment**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. The site appears at `https://<user>.github.io/<repo>/` after a minute or two.

The included `.nojekyll` file tells GitHub Pages to serve the files as-is.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure for both modes |
| `styles.css` | Dark theme with neon-green accents, responsive layout |
| `app.js` | Demo data, routing and energy model, map, simulator, mode toggle |
| `.nojekyll` | Disables Jekyll processing on GitHub Pages |

## Notes on the data

All vehicles, stops, chargers and coordinates are fictional demo data laid out on a sample city grid. The emissions model is illustrative (diesel ≈ 2.68 kg CO₂/L, grid electricity ≈ 0.70 kg CO₂/kWh, with simple multipliers for payload, elevation and traffic). It is meant to show the interaction and not to report real emissions. Replace `VEHICLES`, `STOPS`, `CHARGERS` and `WAREHOUSE` in `app.js` with real data to adapt it.

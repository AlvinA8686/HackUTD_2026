# NEXUS — Property Intelligence

A local working prototype for the HackUTD 2026 CBRE track. Connect fragmented annual building, utility, and weather records; compute transparent subclass and building priority scores; explain drivers; compare electrical mitigation scenarios; and track follow-up actions.

## Start

Requires **Node.js 22.13 or newer** (Node 22.17 is available on the development machine). No package installation, API key, or internet connection is required to run the included demo.

In a terminal opened in this project folder:

```powershell
npm start
```

Open **http://127.0.0.1:3000** in your browser. Keep the terminal running. Stop with Ctrl+C. If port 3000 is already occupied, use:

```powershell
$env:PORT = '3001'
npm start
```

Then open http://127.0.0.1:3001. The application binds to the local computer by default. This prototype has no multi-user authentication and is intended for a local demonstration.

## Use the platform

- **Portfolio:** begins with 30 genuine public building records, five for each building type. Search, filter, sort, inspect each building's scores, see its directed dependency and contributing factors, and export scores.
- **Upload a database:** use CSV, JSON, or SQLite 3. The included full database contains 2,976 matched buildings. Files may contain up to 5,000 records and 10 MiB. Invalid rows remain visible with explanations and do not count toward averages.
- **Building assessment:** enter building type, annual client revenue, annual utility intensities and changes, thermal intensity, building age, and same-year hot/freezing days. Select the appropriate reference peer group and calculate all subclass and combined scores.
- **Actions and scenarios:** save investigation actions to this browser's local queue. Compare an electrical-input scenario to see its effect on electricity, dependent HVAC and overall priority. A changed score is a model scenario, not evidence that a repair was completed.

SQLite uploads accept a flat `buildings` table using the CSV field names. The included normalized database stores weather separately in `weather`; the import API joins it using `weather_key`. Uploads are processed locally; temporary SQLite copies are removed after reading. Portfolio imports are session state and are not written into the source database. Saved actions use browser local storage; clearing that storage removes them.

## Files to use

| File | Contents |
| --- | --- |
| `public/data/buildings.sqlite` | Full clean database, 2,976 buildings, weather, references, sources, lineage |
| `public/data/all-buildings.csv` | All 2,976 flat, ready-to-upload input records |
| `public/data/buildings.csv` / `buildings.json` | Balanced 30-building demo |
| `public/data/template.csv` | Import headers and a valid example row |
| `public/data/scored-buildings.csv` | All 2,976 computed scores and weighted contributions |
| `public/data/worked-example.json` | Formula example and results for all six types |
| `docs/METHODOLOGY.md` | Every formula, parameter, normalization, policy choice, limitation, and worked example |
| `docs/DATA_SOURCES.md` | Public dataset citations, exact joins, coverage, quality checks and reproducibility |
| `docs/DEMO.md` | Short presentation and demonstration sequence |

## Model in brief

All outputs are 0–100 investigation-priority indices. Electricity and plumbing each combine a peer-relative annual use intensity with its actual year-over-year increase. Baseline HVAC combines a thermal-energy proxy, annual weather exposure, and a weak building-vintage proxy. Electricity above 50 adds up to 35% of the remaining HVAC headroom; the dependency runs **Electricity → HVAC** only. Plumbing is independent in this requested simplified graph.

Revenue severity is `100 × revenue / (revenue + $100,000,000)`. Higher revenue always raises overall priority, holding everything else fixed. The final weighted sum follows the supplied weights exactly:

| Building type | Electricity | Plumbing | HVAC | Revenue |
| --- | ---: | ---: | ---: | ---: |
| Technology | 42% | 42% | 10% | 6% |
| Healthcare | 37% | 32% | 25% | 6% |
| Commercial | 27% | 37% | 30% | 6% |
| Residential | 32% | 37% | 25% | 6% |
| Industrial | 22% | 32% | 40% | 6% |
| Institutional | 42% | 22% | 30% | 6% |

The reference year is **2023**; this is a retrospective demonstration, not live telemetry. Actual public observations come from [NYC annual energy and water disclosure](https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am) and [NOAA Central Park daily weather](https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&dataTypes=TMAX%2CTMIN&stations=USW00094728&startDate=2023-01-01&endDate=2023-12-31&units=metric&format=json&includeAttributes=true). The two municipal annual fragments are from the same reporting program; NOAA is a separate collection program. Exact source queries and hashes are retained. No CBRE client relationship is asserted.

**Revenue is explicitly scenario data.** Consumption, weather and building age are screening proxies; scores are not calibrated failure probabilities, safety certifications, engineering diagnoses, or predicted financial losses. Thermal values contain only reported non-electric streams; unknown components remain unknown. High electricity/water use can have legitimate operational causes. Review occupancy, meter coverage, equipment condition, backups and maintenance before acting. See the methodology for the full model assumptions.

## Reproduce and verify

```powershell
npm test
python scripts/build_database.py
node scripts/export_scores.mjs
```

The build uses checked-in, losslessly compressed snapshots and Python's standard library. Network access is needed only for an explicit source refresh through `python scripts/fetch_data.py`. Running the dashboard needs only Node. `npm run check` checks application syntax and runs the tests.

Checks cover independent worked-example arithmetic for every class, score bounds, revenue monotonicity, directed dependencies, missing/invalid values, weather consistency, quoted CSVs, import parity, malformed request handling, path containment and all 2,976 SQLite/CSV records. Browser verification was limited by local preview access restrictions in the development environment.

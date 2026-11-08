# Riskalytics — Property Intelligence

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
- **Upload datasets:** select multiple fragmented CSV, JSON or SQLite files. Review column mappings, match buildings by ID/address and year, resolve conflicting values, and apply the merged portfolio. Shared weather uses one accepted value per reference/year. Invalid rows remain visible with explanations and do not count toward averages.
- **Download a clean database:** export the merged result as SQLite, CSV or JSON with input parameters and risk scores. Clean exports exclude unresolved/incomplete buildings; the review report and SQLite audit tables preserve exclusions, source hashes, original rows and field provenance. [Merge workflow instructions](docs/MERGING_DATA.md) explain matching, supported units and conflict resolution.
- **Building assessment:** enter building type, annual client revenue, annual utility intensities and changes, thermal intensity, building age, and same-year hot/freezing days. Select the appropriate reference peer group and calculate all subclass and combined scores.
- Manual assessments accept decimal revenue and utility inputs, display errors beside invalid fields, and keep your entries when a request fails. Results scroll into view after calculation. Editing inputs clears the previous result until you recalculate; reset restores the example. Imported buildings retain their explicit reference values until the building type or peer group changes.
- **Actions and scenarios:** save investigation actions to this browser's local queue. Compare an electrical-input scenario to see its effect on electricity, dependent HVAC and overall priority. A changed score is a model scenario, not evidence that a repair was completed.

SQLite uploads accept a flat `buildings` table using the CSV field names. The included normalized database stores weather separately in `weather`; the import API joins it using `weather_key`. Uploads are processed locally; temporary SQLite copies are removed after reading. Portfolio imports are session state and are not written into the source database. Saved actions use browser local storage; clearing that storage removes them.

Multi-file uploads are held in local server memory for 30 minutes of inactivity. Each source may contain 5,000 rows and 10 MiB; each merge accepts 10 files, 30,000 source rows and 5,000 building/year records. Save a clean download to retain the merged result. The included three-file example reconstructs the 30-building public-data demo; its optional conflict fixture is clearly labeled intentionally altered test data.

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
| `docs/MERGING_DATA.md` | Multiple-source upload, mapping, matching, conflict review and clean downloads |

## Model in brief

All outputs are 0–100 investigation-priority indices. Electricity and plumbing each combine a peer-relative annual use intensity with its actual year-over-year increase. Baseline HVAC combines a thermal-energy proxy, annual weather exposure, and a weak building-vintage proxy. Electricity above 50 adds up to 35% of the remaining HVAC headroom; the dependency runs **Electricity → HVAC** only. Plumbing is independent in this requested simplified graph.

Revenue severity is `100 × revenue / (revenue + $100,000,000)`. Higher revenue always raises overall priority, holding everything else fixed. The final weighted sum follows the supplied weights exactly:

| Building type | Electricity | Plumbing | HVAC | Revenue |
| --- | ---: | ---: | ---: | ---: |
| Technology | 42% | 10% | 42% | 6% |
| Healthcare | 37% | 25% | 32% | 6% |
| Commercial | 27% | 30% | 37% | 6% |
| Residential | 32% | 25% | 37% | 6% |
| Industrial | 22% | 40% | 32% | 6% |
| Institutional | 42% | 30% | 22% | 6% |

The reference year is **2023**; this is a retrospective demonstration, not live telemetry. Actual public observations come from [NYC annual energy and water disclosure](https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am) and [NOAA Central Park daily weather](https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&dataTypes=TMAX%2CTMIN&stations=USW00094728&startDate=2023-01-01&endDate=2023-12-31&units=metric&format=json&includeAttributes=true). The two municipal annual fragments are from the same reporting program; NOAA is a separate collection program. Exact source queries and hashes are retained. No CBRE client relationship is asserted.

**Revenue is explicitly scenario data.** Consumption, weather and building age are screening proxies; scores are not calibrated failure probabilities, safety certifications, engineering diagnoses, or predicted financial losses. Thermal values contain only reported non-electric streams; unknown components remain unknown. High electricity/water use can have legitimate operational causes. Review occupancy, meter coverage, equipment condition, backups and maintenance before acting. See the methodology for the full model assumptions.

## Reproduce and verify

Install the development test dependencies once with `npm install`. This is needed for the form regression tests; running the application itself still requires only Node.

```powershell
npm test
python scripts/build_database.py
node scripts/export_scores.mjs
```

The build uses checked-in, losslessly compressed snapshots and Python's standard library. Network access is needed only for an explicit source refresh through `python scripts/fetch_data.py`. Running the dashboard needs only Node. `npm run check` checks application syntax and runs the tests.

Checks cover independent worked-example arithmetic for every class, score bounds, revenue monotonicity, directed dependencies, missing/invalid values, weather consistency, quoted CSVs, import parity, malformed request handling, path containment and all 2,976 SQLite/CSV records. Manual form tests use browser-compatible form controls and real HTTP requests against the app server to cover decimal values, errors, all six types, recalculation, imported references, reset, retry and late responses. Multi-source tests cover identity/address matching, column mappings, unit transformations, shared-weather conflicts, explicit resolutions, audit lineage and CSV/JSON/SQLite export round trips, including the full 2,976-building portfolio. Visual browser verification was limited by local preview access restrictions in the development environment.

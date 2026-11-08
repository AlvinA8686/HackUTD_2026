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
- **Upload a database:** use CSV, JSON, or SQLite 3. The included full database contains 2,976 matched buildings. Files may contain up to 5,000 records and 10 MiB. Invalid rows remain visible with explanations and do not count toward averages.
- **Building assessment:** enter building type, annual client revenue, annual utility intensities and changes, thermal intensity, building age, and same-year hot/freezing days. Select the appropriate reference peer group and calculate all subclass and combined scores.
- Manual assessments accept decimal revenue and utility inputs, display errors beside invalid fields, and keep your entries when a request fails. Results scroll into view after calculation. Editing inputs clears the previous result until you recalculate; reset restores the example. Imported buildings retain their explicit reference values until the building type or peer group changes.
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

Checks cover independent worked-example arithmetic for every class, score bounds, revenue monotonicity, directed dependencies, missing/invalid values, weather consistency, quoted CSVs, import parity, malformed request handling, path containment and all 2,976 SQLite/CSV records. Manual form tests use browser-compatible form controls and real HTTP requests against the app server to cover decimal values, errors, all six types, recalculation, imported references, reset, retry and late responses. Visual browser verification was limited by local preview access restrictions in the development environment.


# How the building risk scores work

This prototype produces a transparent **0-100 operational investigation and business-priority index**. Higher means earlier investigation under the chosen policy. It is not a failure probability, an engineering inspection, an ENERGY STAR score, or an estimate of financial loss.

The building-type weights come directly from the corrected user-supplied weighting document, with plumbing and HVAC contribution weights exchanged in model v1.1. The component formulas, thresholds, revenue pivot and cascade coefficient are explicit hackathon policy choices. Public sources support input definitions; they do not validate these coefficients or establish that high consumption causes a failure.

## Four scores and one directed dependency

Calculate independent electricity (`E`), plumbing (`P`) and baseline HVAC (`H0`) scores. Increase HVAC to `H` when electricity is high, then combine `E`, `P`, `H` and revenue severity `R` using the building-type weights.

```text
Electricity inputs -> E ---------------------> building score
                      |
                      +-> HVAC uplift -> H -> building score
HVAC inputs ----------------------> H0
Plumbing inputs -> P -----------------------> building score
Client revenue -> R ------------------------> building score
```

Plumbing never reads electricity or HVAC inputs or scores. Electricity never reads HVAC inputs or scores. Changing HVAC alone cannot change electricity. This graph deliberately follows the requested simplified dependency. Real buildings can have additional dependencies, such as electrically powered water pumps, outside this graph.

## Shared normalization

```text
ramp(x, low, high) = min(1, max(0, (x - low) / (high - low)))
```

The result is zero below `low`, one above `high`, and rises linearly between them. Use unrounded intermediate results; round only the display.

Intensity factors compare a building with a compatible peer reference. Electricity intensity of 60 kWh/ft² against a reference of 30 gives a ratio of 2.0. References must be positive and use matching units. Compatible property use and period are preferable. Explicit cross-year scenario comparisons remain allowed and receive a reference-year mismatch warning when both years are known; this is not a claim of weather or operational normalization. The database documentation identifies the actual cohort and fallback policy. A peer reference is not an engineering limit.

## Electricity

| Parameter | Units | Meaning |
| --- | --- | --- |
| Electricity intensity | kWh/ft²/year | Annual purchased and onsite-consumed electricity divided by gross floor area |
| Electricity peer reference | kWh/ft²/year | Compatible peer intensity |
| Electricity change | percent | Year-over-year increase in electricity intensity |

```text
electricity intensity = (annual purchased + onsite-consumed electricity kWh) / gross floor area ft²
electricity change % = 100 × (current intensity / prior intensity - 1)
E = 75 × ramp(electricity intensity / peer reference, 0.8, 2.0)
  + 25 × ramp(electricity change %, 0, 50)
```

At 80% or less of the reference, the load term contributes zero. At twice the reference it contributes 75 points. A 25% annual increase adds 12.5 trend points; a 50% or greater increase adds 25. Stable or falling use adds no trend points.

The seed uses NYC field `electricity_use_grid_purchase_2`, the disclosed purchased-and-onsite-consumed electricity value in kWh. Its documented fallback, `electricity_use_grid_purchase_1`, is grid-purchase electricity in kWh and is labeled separately in provenance. The unsuffixed `electricity_use_grid_purchase` field is kBtu and is not used as kWh. An anomaly prompts investigation of demand, operating hours, occupancy, controls, metering and capacity. It does **not** demonstrate overload, insulation damage, a circuit fault or an impending outage. Annual consumption is not peak demand.

## Plumbing

| Parameter | Units | Meaning |
| --- | --- | --- |
| Water intensity | US gal/ft²/year | Annual water use divided by gross floor area |
| Water peer reference | US gal/ft²/year | Compatible peer water intensity |
| Water change | percent | Year-over-year increase in water intensity |

```text
water intensity = annual water kgal × 1,000 / gross floor area ft²
water change % = 100 × (current intensity / prior intensity - 1)
P = 75 × ramp(water intensity / peer reference, 0.8, 2.0)
  + 25 × ramp(water change %, 0, 50)
```

At 1.5 times the reference, the load contributes 43.75 points. A 10% increase adds 5, for a score of 48.75.

Water anomalies prompt meter verification, leak investigation and review of occupancy, irrigation and process water. Consumption alone cannot identify a leak, pressure problem, pipe condition, water quality or defect location. Low readings can also indicate reporting problems; this particular high-consumption policy does not classify them as high plumbing risk.

## Baseline HVAC

| Parameter | Units | Meaning |
| --- | --- | --- |
| Thermal intensity | kBtu/ft²/year | Reported-stream subtotal of non-electric thermal energy divided by floor area |
| Thermal peer reference | kBtu/ft²/year | Compatible peer thermal intensity |
| Hot days | days/report year | Days with outdoor maximum at or above 32°C |
| Freeze days | days/report year | Days with outdoor minimum below 0°C |
| Building age | years | Report year minus reported construction year |

The thermal proxy adds only numeric reported non-electric components specified in the dataset documentation, retaining a reported-stream subtotal. Convert components to kBtu before adding them. Unreported streams remain explicitly unknown in provenance; they are not asserted to be observed zeros. A subtotal can understate total thermal energy when some components are unknown, and coverage warnings must be considered alongside its score. Records with no usable thermal stream are excluded from the seed. Do not add incompatible units.

```text
H0 = 65 × ramp(thermal intensity / peer reference, 0.8, 2.0)
   + 10 × min(hot days / 60, 1)
   + 10 × min(freeze days / 120, 1)
   + 15 × ramp(building age, 20, 100)
```

The 65-point term flags high thermal-resource use. Hot and freezing days contribute up to 10 points each as outdoor exposure. Building vintage contributes up to 15 as a weak prompt to investigate the asset record. Age 60 gives 7.5 vintage points.

**Building age is not HVAC equipment age.** New equipment in an old building is not old equipment. The public benchmark does not establish HVAC condition or replacement dates. Gas can serve cooking or industrial processes, and district energy can include uses beyond space conditioning. The thermal term is therefore a load proxy, not HVAC-only consumption or measured HVAC efficiency.

All-electric properties can have zero reported non-electric energy while carrying substantial HVAC load. A low thermal term is not evidence of healthy HVAC. Consult the proxy-coverage notice and obtain HVAC submetering and equipment records before operational decisions.

The 32°C/0°C temperature cutoffs and 60/120-day saturation points are policy assumptions, not equipment limits. These are annual outdoor exposure counts, not indoor or equipment temperatures. Degree-day information retained in the database is contextual; this formula uses hot/freeze counts.

## Electricity increases HVAC

```text
cascade activation = ramp(E, 50, 100)
HVAC uplift = (100 - H0) × 0.35 × cascade activation
H = H0 + HVAC uplift
```

Electricity at or below 50 adds no uplift. Above 50 the uplift increases with electricity. At electricity 100, HVAC receives 35% of its remaining headroom. For example, `H0 = 60` and `E = 100` give `H = 60 + 40 × 0.35 = 74`.

This never lowers HVAC or exceeds 100. The 0.35 coefficient expresses the chosen dependency strength; it is not an estimated conditional failure probability. No reciprocal term appears in electricity and no cascade term appears in plumbing.

Electricity affects the building score directly and indirectly through HVAC. That extra contribution is intentional recognition of a dependent system. It is not statistically independent evidence and cannot estimate a joint failure probability.

## Revenue severity

Use annual client revenue in US dollars for a declared reporting period:

```text
R = 100 × annual revenue USD / (annual revenue USD + 100,000,000)
```

The $100 million pivot produces `R = 50`. Zero revenue gives zero; $10 million gives approximately 9.09; $1 billion gives approximately 90.91. Every finite nonnegative increase in revenue increases the mathematical score, approaching 100 without a hard cap. Rounding can hide very small increases.

Revenue reflects business severity rather than physical failure likelihood. Company-wide revenue is not revenue attributable to one building. This index does not multiply revenue by an outage probability or forecast dollar losses. Public building benchmarks do not establish actual client revenue: seed revenues are clearly labeled scenarios and must be replaced with authorized client data for real use.

## Exact building-type weights

| Building type | Electricity | Plumbing | HVAC | Revenue |
| --- | ---: | ---: | ---: | ---: |
| Technology | 42% | 10% | 42% | 6% |
| Healthcare | 37% | 25% | 32% | 6% |
| Commercial | 27% | 30% | 37% | 6% |
| Residential | 32% | 25% | 37% | 6% |
| Industrial | 22% | 40% | 32% | 6% |
| Institutional | 42% | 30% | 22% | 6% |

```text
building index = wE × E + wP × P + wH × H + 0.06 × R
```

Enter weights as fractions, for example 0.42. Every row sums to 1.00, keeping the combined index within 0-100. Building type changes contribution weights. Mapping a public property's original use into these six categories is documented separately and should be reviewed when ambiguous.

## Worked example for all six types

These illustrative inputs do not describe a particular real property:

| Input | Value |
| --- | ---: |
| Electricity intensity / reference | 60 / 30 kWh/ft²/year |
| Electricity annual increase | 30% |
| Water intensity / reference | 75 / 50 gal/ft²/year |
| Water annual increase | 10% |
| Thermal intensity / reference | 90 / 60 kBtu/ft²/year |
| Hot days / freeze days | 30 / 60 |
| Building age | 60 years |
| Annual client revenue | $100,000,000 |

Electricity: `75 × 1 + 25 × 0.6 = 90`.

Plumbing: `75 × (1.5 - 0.8)/1.2 + 25 × 0.2 = 48.75`.

Baseline HVAC: `65 × (1.5 - 0.8)/1.2 + 10 × 0.5 + 10 × 0.5 + 15 × 0.5 = 55.4166667`.

Cascade activation is `(90 - 50)/50 = 0.8`. Uplift is `(100 - 55.4166667) × 0.35 × 0.8 = 12.4833333`, giving final HVAC **67.9**. Revenue severity is **50**.

The table shows weighted points before display rounding:

| Building type | Electricity points | Plumbing points | HVAC points | Revenue points | Building index |
| --- | ---: | ---: | ---: | ---: | ---: |
| Technology | 37.8 | 4.875 | 28.518 | 3 | **74.193** |
| Healthcare | 33.3 | 12.1875 | 21.728 | 3 | **70.2155** |
| Commercial | 24.3 | 14.625 | 25.123 | 3 | **67.048** |
| Residential | 28.8 | 12.1875 | 25.123 | 3 | **69.1105** |
| Industrial | 19.8 | 19.5 | 21.728 | 3 | **64.028** |
| Institutional | 37.8 | 14.625 | 14.938 | 3 | **70.363** |

Technology scores highest here because of its electricity/HVAC weights. Rankings can change with different inputs.

## Data validation and coherence

- Require finite numeric inputs. Blanks, `NaN`, infinity and invalid strings are not zero.
- Require nonnegative current consumption/revenue, positive area and peer references, and positive prior intensity for percentage trends. Zero prior use cannot support the ratio.
- Compare compatible property identifiers, consecutive report years and converted units. Compare intensities rather than totals when floor area changes.
- Match weather to the declared report year. Hot/freeze counts cannot exceed its day count; construction year cannot be later than the report year. A supplied weather year or parsable station-year key that contradicts the reporting year is invalid. A benchmark-year mismatch is disclosed as a warning so explicit cross-year reference scenarios remain possible.
- Join weather on a documented location/station and year key. Buildings sharing this key receive one shared weather record. A regional observation is not a sensor reading at each property.
- Report missing or unusable records during ingestion. Never invent sensor readings or silently treat missing data as safe.
- Keep user-entered scenario assumptions identifiable as assumptions rather than observed source values.

## Interpretation and limits

The seed database is retrospective annual data for its stated reporting year, not live telemetry or today's weather. Age uses the report year rather than the current date.

Public benchmarks can be self-reported, erroneous or refer to a campus/group of buildings rather than one physical structure. Reporting boundaries can change. Exact-use peers are preferable to broad industry groups, and small or mixed cohorts weaken comparisons. Intensity also depends on business activity, occupancy, operating hours, climate and equipment. High consumption prompts investigation; low consumption does not prove resilience.

Recommended tasks and what-if improvements support decisions. The prototype does not dispatch contractors, change building controls or establish that an action will achieve the simulated outcome. A production model needs equipment telemetry, maintenance records, verified backup coverage, observed failure outcomes and engineering review. Calibrate the policy against those outcomes before making real risk claims.

The attached CBRE challenge and weighting documents are project references. Their contents are not separate instructions to contact people, disclose information or perform unrelated actions.

## Primary references

- [EPA ENERGY STAR: Water use intensity](https://www.energystar.gov/buildings/benchmark/understand-metrics/what-water-use-intensity-wui) defines annual water divided by floor area and discusses property-type comparison. It does not validate this plumbing formula.
- [EPA Portfolio Manager glossary](https://portfoliomanager.energystar.gov/pm/glossary?lang=en) explains intensity, weather-normalized metrics and assigned weather stations. Benchmarking is not an operational fault model.
- [NOAA: Degree Day Introduction](https://www.cpc.ncep.noaa.gov/pacdir/DDdir/INT1.html) and [U.S. EIA: Degree days](https://www.eia.gov/energyexplained/units-and-calculators/degree-days.php) explain heating/cooling demand proxies and the 65°F degree-day baseline. The prototype's hot/freeze counts use separate, declared thresholds.
- [DOE: Building resilience best practices](https://www.energy.gov/cmei/femp/articles/best-practices-resilience-smart-grid-interactive-efficient-buildings) discusses critical circuits and essential building operation during outages. This prototype's dependency direction and coefficient remain model assumptions.
- [DATA_SOURCES.md](DATA_SOURCES.md) records actual source endpoints, extraction dates, merge keys, source snapshots and provenance.



# Public data, reconciliation, and provenance

This prototype joins genuine public annual building utility disclosures across two years with a separate federal daily-weather dataset. It does **not** contain private CBRE operational telemetry or actual client revenue. The buildings are public records; no CBRE client relationship is asserted. Client revenue is an explicitly labeled demonstration scenario.

## Sources and exact retrieval evidence

1. **NYC Department of Buildings, Local Law 84 energy and water disclosure, calendar year 2023.** Dataset ID `5zyy-y8am`, [NYC Open Data catalog](https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am). The [NYC benchmarking program](https://www.nyc.gov/site/buildings/codes/benchmarking.page) explains the reporting context. The snapshot includes 33,684 submitted rows representing 33,062 property IDs.
2. **The same NYC disclosure dataset, calendar year 2022.** A separately retrieved annual fragment, 30,485 submitted rows, supplies actual prior-year intensity measurements. It is joined by stable property identity, not by guessing similar addresses. These are two annual fragments of one municipal reporting program, not two independent collection programs.
3. **NOAA NCEI GHCN-Daily, station `USW00094728`, Central Park, calendar year 2023.** [Station details](https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00094728/detail), [Access Data Service](https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&dataTypes=TMAX%2CTMIN&stations=USW00094728&startDate=2023-01-01&endDate=2023-12-31&units=metric&format=json&includeAttributes=true). This is a separate federal weather collection. All 365 daily maximum/minimum pairs pass the supplied NOAA quality flags.

The precise encoded API URLs are preserved in `data/raw/queries.json` and `public/data/sources.json`. The latter records retrieval timestamps, source names, record counts, and SHA-256 hashes of the **uncompressed** downloaded JSON bytes. Original responses are retained losslessly as:

- `data/raw/nyc_ll84_2023.json.gz`
- `data/raw/nyc_ll84_2022.json.gz`
- `data/raw/noaa_central_park_2023.json.gz`

Use these snapshots for an offline, reproducible demonstration. Run `python scripts/fetch_data.py` to fetch only missing snapshots, then `python scripts/build_database.py` to rebuild. Refreshing is explicit: archive or rename snapshots first if fresh observations are required. Rebuilding does not silently replace data from the network. The source APIs may change; the checked-in hashes identify the exact records used in this demonstration.

## Clean database and dashboard files

| File | Purpose |
|---|---|
| `public/data/buildings.sqlite` | Full normalized SQLite database: **2,976** clean buildings with actual two-year matches |
| `public/data/all-buildings.csv` | All 2,976 scored-input rows, ready to upload to the dashboard |
| `data/clean_buildings.json` | Full records including nested row-level provenance |
| `public/data/buildings.json` | Balanced **30-building** dashboard demonstration, five buildings per class |
| `public/data/buildings.csv` | The same 30 records in a flat upload format |
| `public/data/import-template.csv`, `public/data/template.csv` | Header and one valid example row |
| `public/data/benchmarks.json` | Frozen exact-subtype peer medians and cohort sizes |
| `public/data/sources.json` | Exact queries, snapshot hashes, and retrieval metadata |
| `public/data/data-quality.json` | Counts, join results, and station weather summary |

The dashboard sample is deterministic and balanced for a live demo. Within each class the script orders buildings by the sum of three peer-relative intensities and selects five evenly spaced positions. It is **not** a statistically representative portfolio or survey. It includes observed extremes to demonstrate prioritization. The full CSV and SQLite database preserve the larger clean population.

## Building types and reference cohorts

The user requested six broad types. To avoid comparing unlike uses, this demo gives each broad type exactly one publicly reported subtype. An office building is not called a technology building merely because a technology company might occupy it.

| Platform building type | Exact reported property type | 2023 reference cohort | Clean two-year database |
|---|---|---:|---:|
| Technology | Data Center | 56 | 51 |
| Healthcare | Hospital (General Medical & Surgical) | 12 | 6 |
| Commercial | Office | 575 | 308 |
| Residential | Multifamily Housing | 4,569 | 2,492 |
| Industrial | Manufacturing/Industrial Plant | 99 | 56 |
| Institutional | K-12 School | 135 | 63 |
| Total | | **5,446** | **2,976** |

Reference values are medians of **all 5,446 eligible current-year observations by exact reported subtype**, not the 30 displayed examples and not only the prior-year matched subset. Every measure uses the same complete eligible cohort within a subtype. All peer medians are positive. Hospital references have only 12 buildings and should be treated cautiously. The broad-type fallback references in `benchmarks.json` point to the listed subtype; they are **not** estimates for every possible hospital/clinic, retail/office, manufacturing/warehouse, or institutional use. A broader application should introduce adequate cohorts for each additional subtype.

## Cleaning and identity reconciliation

The script applies the same screening rules to current- and prior-year input:

1. Select the newest submission per EPA Portfolio Manager `property_id`. A deterministic row-content ordering resolves identical timestamps. Do not sum duplicate submissions.
2. Retain the six exact property types listed above, exactly **one reported building**, whole-property energy metering and whole-property water metering. Campus totals are not relabeled as single buildings.
3. Require both aggregate `estimated_values_energy` and `estimated_values_water` to be `No`. Require the reported energy-short-period, energy-gap, energy-overlap, and water-short-period alerts to be `Ok`. These are reporter/software flags, not independent engineering verification.
4. Require calculated building floor area of 10,000–5,000,000 ft² and a reported construction year between 1800 and the reporting year. Parking area is excluded by using `property_gfa_calculated_1`, the calculated **buildings-only** area.
5. Require positive reported electricity and water use. Require at least one numeric non-electric energy stream, with no reported negative value. Missing quantities remain missing in provenance.
6. Screen obvious unit/entry problems: electricity intensity must be >0 and ≤1,000 kWh/ft²/year; water >0 and ≤1,000 gallons/ft²/year; reported non-electric energy ≥0 and ≤2,000 kBtu/ft²/year. These deliberately broad data screens are **not safety limits or scoring thresholds**. Other reporting errors can survive screening.
7. For year-on-year comparisons, require the same `property_id`, exactly matching reported BIN and BBL identifiers, the same exact property type, and no more than a 10% change in calculated floor area. Compare **intensities**, not unadjusted totals.

The `property_id` key is an EPA property record rather than a universal physical-building key. Even a record reporting one building can have imperfect tax-lot/building identifiers. No fuzzy address join is used. Property changes, mixed uses, occupancy changes, or corrected meter records can still affect trends; a positive trend is an investigation trigger rather than proof of equipment deterioration.

## Units and transformations

| Clean field | Actual input and transformation |
|---|---|
| `electricity_kwh_sqft` | `electricity_use_grid_purchase_2 / property_gfa_calculated_1`: electricity purchased from the grid **plus onsite renewable generation used onsite**, in kWh/ft²/year. If unavailable, grid purchase `_1` is used and explicitly labeled in `electricity_coverage` and row provenance. |
| `water_gal_sqft` | `water_use_all_water_sources × 1,000 / property_gfa_calculated_1`. Source water is **kgal**, clean output is gallons/ft²/year. This includes reported indoor/outdoor uses and is not a leak measurement. |
| `thermal_kbtu_sqft` | Sum **available numeric reported** natural gas, district steam, district hot water, district chilled water, fuel oils 1/2/4/5&6, diesel, propane, and kerosene, divided by buildings-only floor area. Every selected field is labeled kBtu by the source schema. |
| `electricity_change_pct` | `100 × (2023 electricity intensity / 2022 electricity intensity − 1)` |
| `water_change_pct` | `100 × (2023 water intensity / 2022 water intensity − 1)` |
| `building_age_years` | `2023 − year_built`. This is **building age**, not wiring, pipe, HVAC equipment, or time-since-renovation age. |
| `hot_days` | Count of NOAA 2023 days with `TMAX ≥ 32°C`: **12** |
| `freeze_days` | Count of NOAA 2023 days with `TMIN < 0°C`: **23** |
| `annual_revenue_usd` | Explicit scenario: choose from $10m, $50m, $100m, $250m, $750m, $2bn using `property_id modulo 6`. **No actual client revenue is asserted.** |

`thermal_kbtu_sqft` is a **reported-stream subtotal and lower-bound coverage proxy** when fuel streams are unavailable. An unavailable stream is **not an observed zero**. The per-record `thermal_coverage` note and nested `thermal_missing_streams` list preserve this distinction. A record with every non-electric stream unavailable is excluded; a numeric source zero is retained. A zero subtotal does not certify that a building is all-electric. The subtotal can include cooking, hot water, industrial processes, or backup generation and does not isolate HVAC load. Fully electric heating/cooling is also not captured by this subtotal. This limitation appears in the risk explanation and must accompany any exported use of this proxy.

High electricity intensity may reflect legitimate data-center activity; high water use may reflect legitimate hospital activity; high thermal use may reflect operational requirements. Even exact-type peers cannot establish causality. The model is a transparent prioritization index pending actual equipment-condition and fault-outcome validation.

## Spatial and temporal consistency

All utility inputs describe **calendar year 2023**, the prior trend inputs describe **2022**, and the weather fragment covers **2023**. `building_age_years` is measured as of 2023, not the computer's current year.

Every NYC building uses the same explicit regional station key, **`USW00094728:2023`**, and therefore has identical `hot_days=12` and `freeze_days=23`. The SQLite `weather` table stores that observation once and buildings reference it by foreign key. Its annual mean temperature, estimated as the mean of daily `(TMAX+TMIN)/2`, is **14.449°C**. No contradictory building-specific city temperature is invented.

Central Park is a **regional station proxy**, not a claim that all five boroughs have identical microclimates or that it is each building's nearest station. Building coordinates remain their actual disclosed coordinates; the weather source is labeled separately. An actual Plano, TX upload must carry Plano weather for the stated period and an appropriate reference cohort, not reuse these NYC values.

## SQLite data model and proof of lineage

`buildings` stores stable identity, annual observations, derived model inputs, scenario revenue labels, reference values, and coverage notes. `weather` stores a unique station/year observation. `benchmarks` stores subtype/year/version references. `sources` records exact query URLs and raw snapshot hashes. `provenance` records each derived risk field's source, original property or station key, and transformation. `building_risk_inputs` joins buildings to weather into one flat scoring view.

The full JSON also preserves source raw-row indexes and submission timestamps for both years. For example, looking up any `provenance.current.raw_row_index` in the uncompressed 2023 snapshot reproduces that building's original utility fields. The SQLite build checks foreign-key consistency and database integrity before completing. Revenue provenance intentionally has no external source ID because it is a scenario.

The included data is historical and sourced; it is not live operational monitoring. Replace annual proxies with verified panel-load, protection-system, pipe-pressure/leak, maintenance, temperature, and HVAC performance telemetry before using the system for equipment-failure prediction.


# Live demonstration

## Opening

"Building data lives in separate places. We connect annual electricity/water disclosures, property records and shared weather into one traceable database, then turn those inputs into explainable investigation priorities. This is a working priority index, not a failure probability."

## 1. Explore the portfolio

Open the portfolio tab and load the included sample. Show electricity, plumbing, HVAC and the combined score. Select a building to inspect its parameters, source year, weights and score explanations. Point out that demo revenue is a labeled scenario: public benchmarks do not contain actual client revenue.

Trace one stable property identifier through annual electricity/water records and the shared location-year weather join. Show that properties using the same weather key have identical hot/freeze values. Seed records are retrospective rather than live readings.

## 2. Explain the cascade

"Our graph follows the requested dependency: electricity can increase HVAC risk while plumbing stays independent. HVAC does not feed backward into electricity."

Inspect a building whose electricity score is above 50. Show baseline HVAC, electricity uplift and final HVAC separately. At electricity 100, the policy adds 35% of HVAC's remaining headroom without exceeding 100.

## 3. Use the manual calculator

Enter the [methodology example](METHODOLOGY.md):

- Technology; annual client revenue $100 million.
- Electricity 60 kWh/ft²/year; reference 30; annual increase 30%.
- Water 75 gal/ft²/year; reference 50; annual increase 10%.
- Thermal energy 90 kBtu/ft²/year; reference 60.
- Hot days 30; freeze days 60; building age 60 years.

Expected unrounded results: electricity **90**, plumbing **48.75**, baseline HVAC **55.4166667**, final HVAC **67.9**, revenue **50**, Technology combined **74.193**.

Switch to Institutional while keeping every input and reference fixed. The combined score becomes **70.363** because the contribution weights change. Component scores stay fixed if their parameters/references stay fixed.

## 4. Show an actionable what-if

Simulate an electrical improvement: lower electricity intensity to 30 and annual change to zero, keeping all other example inputs fixed. Electricity becomes **12.5**. The cascade turns off, so HVAC returns to its baseline **55.4166667**. Plumbing remains **48.75**. Technology combined becomes **36.4**.

Next action: review demand and operating changes, verify metering/capacity, and investigate HVAC power and backup arrangements with the facilities team. The scenario illustrates the model dependency; it does not prove that lowering annual electricity use prevents an outage.

Change only water use. Plumbing and the total change, while electricity and HVAC stay fixed. Change only HVAC inputs to show electricity stays fixed. Increasing revenue raises business priority without changing subsystem scores.

## 5. Import a file

Upload the included CSV or JSON sample and show scores for all valid rows. Introduce a blank required input or invalid number to demonstrate validation. Missing measurements are reported instead of silently treated as zero risk.

## Closing

"The useful result is a prioritized list with a reason, a traceable input and a suggested investigation. Real deployment replaces annual proxies with verified equipment telemetry and maintenance records, then validates the policy against observed failures."

The demo sends no messages, issues no external work orders and changes no building controls.

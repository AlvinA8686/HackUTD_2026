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

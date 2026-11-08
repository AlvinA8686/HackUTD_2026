# How the building risk scores work

This prototype produces a transparent **0-100 operational investigation and business-priority index**. Higher means earlier investigation under the chosen policy. It is not a failure probability, an engineering inspection, an ENERGY STAR score, or an estimate of financial loss.

The building-type weights come directly from the user-supplied weighting document. The component formulas, thresholds, revenue pivot and cascade coefficient are explicit hackathon policy choices. Public sources support input definitions; they do not validate these coefficients or establish that high consumption causes a failure.

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
| Technology | 42% | 42% | 10% | 6% |
| Healthcare | 37% | 32% | 25% | 6% |
| Commercial | 27% | 37% | 30% | 6% |
| Residential | 32% | 37% | 25% | 6% |
| Industrial | 22% | 32% | 40% | 6% |
| Institutional | 42% | 22% | 30% | 6% |

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
| Technology | 37.8 | 20.475 | 6.79 | 3 | **68.065** |
| Healthcare | 33.3 | 15.6 | 16.975 | 3 | **68.875** |
| Commercial | 24.3 | 18.0375 | 20.37 | 3 | **65.7075** |
| Residential | 28.8 | 18.0375 | 16.975 | 3 | **66.8125** |
| Industrial | 19.8 | 15.6 | 27.16 | 3 | **65.56** |
| Institutional | 37.8 | 10.725 | 20.37 | 3 | **71.895** |

Institutional scores highest here because of its electricity/HVAC weights. Rankings can change with different inputs.

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


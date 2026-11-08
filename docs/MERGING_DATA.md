# Merge fragmented datasets in Riskalytics

The platform now accepts multiple source files in its existing Upload datasets dialog. It performs column mapping, building matching, unit normalization, conflict review and risk scoring inside the application. No external service or account is required.

## Use the workflow

1. Click **Upload datasets**, then **Select datasets**. Select several CSV, JSON or SQLite files, or add more files afterward.
2. Review the record type for each file. Choose **Building records** for metadata, utilities or client revenue; choose **Shared weather** for station/location-level annual observations.
3. Expand **Review column mapping and units**. Recognized headings are mapped automatically. Map unfamiliar headings explicitly or leave them ignored. Original source rows remain in the SQLite audit tables even when columns are ignored for scoring.
4. Set the default reporting year for rows that lack a year. Explicit source years take precedence. This assumption is included in provenance.
5. Click **Merge & calculate risk**. Review matched buildings, unresolved conflicts, missing inputs and ignored columns.
6. Select the accepted source value for each conflict, then **Apply choices & recalculate**. No conflicting value is silently chosen. A shared weather decision applies consistently to every building using that reference and year.
7. Click **Use merged portfolio** to display the result in the existing dashboard. Records needing review remain visible and do not contribute to averages.
8. Click **Export scores** after applying the merged portfolio to download the clean database as SQLite, CSV or JSON. You can also download directly from the merge review. The full review report includes unresolved records and decisions.

## Matching rules

- Match building IDs or property IDs within the same reporting year. IDs retain their namespace and characters; matching ignores surrounding whitespace and letter case.
- If IDs are absent, match street address plus city and state/postal code plus reporting year. Common street suffixes such as Street/St are normalized. Building names alone never join records.
- Metadata that includes both identifiers can bridge an ID-only utility fragment with another compatible identifier. A property ID associated with multiple building IDs is flagged as ambiguous.
- Multiple strong building IDs at one address remain separate. An address-only row that could belong to more than one ID is flagged rather than assigned arbitrarily.
- A derived `MERGED-…` or `PROPERTY-…` output ID identifies a consolidated record when no building ID was supplied. It is not presented as an original government identifier.
- Weather joins use an explicit weather reference/station and reporting year, or a city/state/postal-code and year reference. Multiple matching weather stations require an explicit choice. Different years never join automatically.
- Records with unresolved conflicts or invalid/missing scoring inputs are excluded from the clean buildings table. Their original rows and quality issues are retained in the review report and SQLite audit tables.

## Supported input fields and units

The mapping menu lists the canonical fields and units. Important fields include:

| Purpose | Fields |
| --- | --- |
| Match records | `building_id`, `property_id`, `address`, `city`, `state`, `postal_code`, `report_year` |
| Class and business exposure | `building_type`, `property_type`, `annual_revenue_usd`, `revenue_source` |
| Electricity | `electricity_kwh_sqft`, `electricity_change_pct`, or annual `electricity_kwh` and `floor_area_sqft` |
| Water | `water_gal_sqft`, `water_change_pct`, or annual `water_gallons` / `water_kgal` and `floor_area_sqft` |
| HVAC | `thermal_kbtu_sqft` or annual `thermal_kbtu` with area; `building_age_years` or `year_built`; `hot_days`, `freeze_days` |
| Prior period | `previous_report_year`, previous electricity/water intensities, or previous totals with `previous_floor_area_sqft` |
| Shared weather | `weather_key` or `station_id`, location, year, hot/freezing day counts; optional annual mean temperature in °C or °F |
| Reference comparison | Optional complete `reference_electricity_kwh_sqft`, `reference_water_gal_sqft`, `reference_thermal_kbtu_sqft`, label and year |

Water in thousand US gallons is multiplied by 1,000. Fahrenheit mean temperature is converted to Celsius. Utility intensity is calculated from annual total divided by floor area when both are available. Annual percentage changes require positive previous intensity and a consecutive previous reporting year. Building age may be calculated from reporting year minus construction year.

The workflow does not guess unknown units, invent maintenance telemetry, assume missing consumption is zero, infer hot/freezing day counts from a single temperature, or fabricate client revenue. A supplied intensity that disagrees with the value calculated from totals and area becomes a conflict for review. Existing reference cohorts and the corrected plumbing/HVAC contribution weights remain in use.

## Download contents

The clean `buildings` table contains input parameters plus electricity, plumbing, baseline HVAC, cascade uplift, final HVAC, revenue and overall building scores, priority band and model version. Only complete, conflict-free scored records enter this table.

SQLite also contains `metadata`, `sources`, `source_records`, `conflicts`, `merge_issues`, `field_provenance` and `weather_provenance`. These retain file hashes, column mappings, original rows, accepted conflict choices, exclusions and transformations. Shared weather observations are stored once rather than repeated for every building. JSON includes shared weather provenance and exclusion summaries; CSV includes flat input/score columns and row-level provenance references. CSV textual values are protected against spreadsheet formula execution.

These formats can be uploaded again using the platform's import functionality. Scores are recomputed by the current model instead of trusting scores supplied in an uploaded file.

## Included demonstration

**Load merge example** splits the existing 30-building public-data demo into three files: a building register, utility records and shared NOAA annual weather. This is an intentionally prepared fragmentation example derived from the retained, cited public observations; it is not three newly retrieved source datasets. Revenue remains explicitly illustrative. [DATA_SOURCES.md](DATA_SOURCES.md) documents the original public sources.

**Add conflict example** loads `conflicting-weather.csv`, which deliberately alters the hot-day count. It is clearly labeled synthetic test data and must not be described as a NOAA observation. The conflict should affect all 30 buildings. Choosing the original count of 12 restores the source-backed climate input for all of them.

## Limits and storage

Each file may contain up to 5,000 rows and 10 MiB. A merge accepts up to 10 files, 30,000 source rows and 5,000 consolidated building/year records. Uploaded parsed rows live in local server memory, with an 80 MiB / 50-file workspace cap. Unused uploads expire after 30 minutes; restarting the server clears them. Re-upload expired files before exporting again. Temporary SQLite upload/export copies are removed after processing. Save a download to retain the consolidated result.

CSV requires a header. JSON accepts a row array or an object with `buildings`, `rows`, `records` or `weather`. SQLite accepts a `buildings` table, a `weather` table, or one unambiguous data table. The existing normalized demo database is supported through its building-to-weather join.

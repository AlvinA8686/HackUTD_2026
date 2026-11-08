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

Expected unrounded results: electricity **90**, plumbing **48.75**, baseline HVAC **55.4166667**, final HVAC **67.9**, revenue **50**, Technology combined **68.065**.

Switch to Institutional while keeping every input and reference fixed. The combined score becomes **71.895** because the contribution weights change. Component scores stay fixed if their parameters/references stay fixed.

## 4. Show an actionable what-if

Simulate an electrical improvement: lower electricity intensity to 30 and annual change to zero, keeping all other example inputs fixed. Electricity becomes **12.5**. The cascade turns off, so HVAC returns to its baseline **55.4166667**. Plumbing remains **48.75**. Technology combined becomes **34.2666667**.

Next action: review demand and operating changes, verify metering/capacity, and investigate HVAC power and backup arrangements with the facilities team. The scenario illustrates the model dependency; it does not prove that lowering annual electricity use prevents an outage.

Change only water use. Plumbing and the total change, while electricity and HVAC stay fixed. Change only HVAC inputs to show electricity stays fixed. Increasing revenue raises business priority without changing subsystem scores.

## 5. Import a file

Upload the included CSV or JSON sample and show scores for all valid rows. Introduce a blank required input or invalid number to demonstrate validation. Missing measurements are reported instead of silently treated as zero risk.

## Closing

"The useful result is a prioritized list with a reason, a traceable input and a suggested investigation. Real deployment replaces annual proxies with verified equipment telemetry and maintenance records, then validates the policy against observed failures."

The demo sends no messages, issues no external work orders and changes no building controls.

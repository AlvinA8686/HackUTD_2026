export const MODEL_VERSION = 'nexus-priority-v1.0';
export const WEIGHTS = Object.freeze({
  Technology: { electricity: 0.42, plumbing: 0.42, hvac: 0.10, revenue: 0.06 },
  Healthcare: { electricity: 0.37, plumbing: 0.32, hvac: 0.25, revenue: 0.06 },
  Commercial: { electricity: 0.27, plumbing: 0.37, hvac: 0.30, revenue: 0.06 },
  Residential: { electricity: 0.32, plumbing: 0.37, hvac: 0.25, revenue: 0.06 },
  Industrial: { electricity: 0.22, plumbing: 0.32, hvac: 0.40, revenue: 0.06 },
  Institutional: { electricity: 0.42, plumbing: 0.22, hvac: 0.30, revenue: 0.06 },
});
export const PARAMETERS = [
  { key: 'annual_revenue_usd', label: 'Annual client revenue', unit: 'USD / year', min: 0, max: 1e15, step: 1000000, default: 100000000, group: 'Revenue', help: 'Client revenue is a business-impact scenario, not the probability of equipment failure.' },
  { key: 'electricity_kwh_sqft', label: 'Electricity intensity', unit: 'kWh / ft² / year', min: 0, max: 100000, step: 0.01, default: 35, group: 'Electricity', help: 'Annual electricity use divided by gross floor area. Compared with the selected peer median.' },
  { key: 'electricity_change_pct', label: 'Electricity intensity change', unit: '% year over year', min: -100, max: 1000000, step: 0.01, default: 25, group: 'Electricity', help: '100 × (current-year intensity / previous-year intensity − 1). Negative changes do not add escalation points.' },
  { key: 'water_gal_sqft', label: 'Water intensity', unit: 'gal / ft² / year', min: 0, max: 1000000, step: 0.01, default: 65, group: 'Plumbing', help: 'All-source annual water use divided by gross floor area. Elevated consumption calls for investigation; it does not prove a leak.' },
  { key: 'water_change_pct', label: 'Water intensity change', unit: '% year over year', min: -100, max: 1000000, step: 0.01, default: 20, group: 'Plumbing', help: 'Annual change in water intensity. Use consecutive full calendar years with comparable metering.' },
  { key: 'thermal_kbtu_sqft', label: 'Thermal energy intensity', unit: 'kBtu / ft² / year', min: 0, max: 1000000, step: 0.01, default: 65, group: 'HVAC', help: 'Non-electric fuels and district energy divided by gross floor area. A thermal-load proxy, not HVAC submetering.' },
  { key: 'building_age_years', label: 'Building age', unit: 'years at reporting year', min: 0, max: 500, step: 1, default: 60, group: 'HVAC', help: 'Reporting year minus year built. A weak building-vintage / inspection proxy; this is not HVAC equipment age.' },
  { key: 'hot_days', label: 'Hot days in reporting year', unit: 'days with maximum ≥ 32°C', min: 0, max: 366, step: 1, default: 30, group: 'HVAC', help: 'Annual daily-maximum heat exposure from one shared regional station and year.' },
  { key: 'freeze_days', label: 'Freezing days in reporting year', unit: 'days with minimum < 0°C', min: 0, max: 366, step: 1, default: 60, group: 'HVAC', help: 'Annual daily-minimum cold exposure. All records with the same weather key must agree.' },
];
const clip = (x) => Math.min(1, Math.max(0, x));
export const ramp = (x, low, high) => clip((x - low) / (high - low));
export class ValidationError extends Error {
  constructor(issues) { super(issues.join('; ')); this.name = 'ValidationError'; this.issues = issues; }
}

export function resolveReference(building, benchmarks = {}) {
  const explicitKeys = ['reference_electricity_kwh_sqft', 'reference_water_gal_sqft', 'reference_thermal_kbtu_sqft'];
  const explicit = explicitKeys.some(k => building[k] !== undefined && building[k] !== '');
  if (explicit) return {
    electricity_kwh_sqft: building.reference_electricity_kwh_sqft,
    water_gal_sqft: building.reference_water_gal_sqft,
    thermal_kbtu_sqft: building.reference_thermal_kbtu_sqft,
    label: building.reference_label || (building.property_type ? `${building.property_type} (${building.benchmark_version || 'supplied reference'})` : 'Explicit supplied reference'),
    count: building.reference_count ?? building.peer_count,
    report_year: building.reference_year ?? (building.benchmark_version === benchmarks.version ? benchmarks.report_year : undefined),
    basis: 'supplied',
  };
  const narrow = benchmarks.property_types?.[building.property_type];
  if (narrow) return { ...narrow, label: building.property_type, basis: 'property_type' };
  const broad = benchmarks.building_types?.[building.building_type];
  if (broad) return { ...broad, label: building.building_type, basis: 'building_type' };
  throw new ValidationError(['No reference cohort found. Select a supported building / property type or supply all three reference intensities.']);
}

export function validateBuilding(input, benchmarks = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError(['A building object is required.']);
  const building = { ...input };
  const issues = [];
  if (typeof building.building_type !== 'string' || !Object.hasOwn(WEIGHTS, building.building_type)) issues.push('building_type must be Technology, Healthcare, Commercial, Residential, Industrial, or Institutional.');
  for (const key of ['name', 'address', 'city', 'building_id', 'property_type', 'weather_key', 'reference_label', 'revenue_source', 'benchmark_version']) {
    if (building[key] !== undefined && building[key] !== null && typeof building[key] !== 'string' && typeof building[key] !== 'number') issues.push(`${key} must be plain text.`);
  }
  for (const key of ['report_year','weather_year','year_built','reference_year','reference_count','peer_count']) {
    if (building[key] !== undefined && building[key] !== null && (typeof building[key] === 'object' || typeof building[key] === 'boolean')) issues.push(`${key} must be numeric.`);
  }
  if (issues.length) throw new ValidationError(issues);
  for (const p of PARAMETERS) {
    const raw = building[p.key];
    if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object' || typeof raw === 'string' && raw.trim() === '') {
      issues.push(`${p.key} is required; missing values are not scored as zero.`); continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < p.min || n > p.max) issues.push(`${p.key} must be a finite number between ${p.min} and ${p.max}.`);
    else building[p.key] = n;
  }
  for (const key of ['hot_days', 'freeze_days', 'building_age_years']) if (typeof building[key] === 'number' && !Number.isInteger(building[key])) issues.push(`${key} must be a whole number.`);
  if (building.report_year !== undefined && building.report_year !== '') {
    const year = Number(building.report_year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) issues.push('report_year must be a valid calendar year.');
    else {
      building.report_year = year;
      const days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
      for (const key of ['hot_days', 'freeze_days']) if (building[key] > days) issues.push(`${key} exceeds the days in report_year.`);
      if (building.weather_year !== undefined && Number(building.weather_year) !== year) issues.push('Weather year must match report_year.');
      const keyYear = typeof building.weather_key === 'string' && building.weather_key.match(/:(\d{4})$/);
      if (keyYear && Number(keyYear[1]) !== year) issues.push('Weather key year must match report_year.');
      if (building.year_built !== undefined && Number(building.year_built) !== year - building.building_age_years) issues.push('year_built, reporting year, and building age disagree.');
    }
  }
  let reference;
  try { reference = resolveReference(building, benchmarks); } catch (e) { issues.push(...e.issues); }
  if (reference) {
    for (const key of ['electricity_kwh_sqft', 'water_gal_sqft', 'thermal_kbtu_sqft']) {
      const raw = reference[key];
      if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean' || typeof raw === 'object' || typeof raw === 'string' && raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) <= 0) issues.push(`Reference ${key} must be greater than zero. A zero cohort median cannot be used as a denominator.`);
      else reference[key] = Number(raw);
    }
  }
  if (issues.length) throw new ValidationError(issues);
  return { building, reference };
}

export function scoreBuilding(input, benchmarks = {}) {
  const { building: b, reference: ref } = validateBuilding(input, benchmarks);
  const drivers = [];
  function term(system, parameter, label, value, normalized, weight, message, action) {
    const points = normalized * weight;
    drivers.push({ system, parameter, label, value, normalized, points, message, action });
    return points;
  }
  const electricityRatio = b.electricity_kwh_sqft / ref.electricity_kwh_sqft;
  const waterRatio = b.water_gal_sqft / ref.water_gal_sqft;
  const thermalRatio = b.thermal_kbtu_sqft / ref.thermal_kbtu_sqft;
  const electricity = term('Electricity', 'electricity_kwh_sqft', 'Electricity vs peer', electricityRatio, ramp(electricityRatio, .8, 2), 75,
    `${electricityRatio.toFixed(2)}× the ${ref.label} electricity reference. Elevated use can indicate unusual load or inefficiency.`, 'Review interval demand and electrical capacity with the facility engineer; check for changed occupancy or process load.')
    + term('Electricity', 'electricity_change_pct', 'Electricity trend', b.electricity_change_pct, ramp(b.electricity_change_pct, 0, 50), 25,
      `${b.electricity_change_pct.toFixed(1)}% year-over-year electricity intensity change.`, 'Reconcile meter coverage, occupied hours and recent equipment changes before inspecting loads.');
  const plumbing = term('Plumbing', 'water_gal_sqft', 'Water vs peer', waterRatio, ramp(waterRatio, .8, 2), 75,
    `${waterRatio.toFixed(2)}× the ${ref.label} water reference. High use warrants investigation, not a leak diagnosis.`, 'Compare after-hours water flow and meter boundaries; inspect fixtures and irrigation for unexplained demand.')
    + term('Plumbing', 'water_change_pct', 'Water trend', b.water_change_pct, ramp(b.water_change_pct, 0, 50), 25,
      `${b.water_change_pct.toFixed(1)}% year-over-year water intensity change.`, 'Reconcile annual meter totals and occupancy; investigate persistent unexplained water increases.');
  const hvacBase = term('HVAC', 'thermal_kbtu_sqft', 'Thermal load vs peer', thermalRatio, ramp(thermalRatio, .8, 2), 65,
    `${thermalRatio.toFixed(2)}× the ${ref.label} non-electric thermal reference; process and cooking loads may be included.`, 'Review heating/cooling schedules and thermal meters; separate process loads before assessing HVAC performance.')
    + term('HVAC', 'hot_days', 'Heat exposure', b.hot_days, clip(b.hot_days / 60), 10,
      `${b.hot_days} days with a regional daily maximum of at least 32°C.`, 'Check cooling capacity, filters and heat-wave readiness before the hot season.')
    + term('HVAC', 'freeze_days', 'Cold exposure', b.freeze_days, clip(b.freeze_days / 120), 10,
      `${b.freeze_days} days with a regional daily minimum below 0°C.`, 'Review heating reliability and cold-weather controls with the facilities team.')
    + term('HVAC', 'building_age_years', 'Building vintage', b.building_age_years, ramp(b.building_age_years, 20, 100), 15,
      `Building age is ${b.building_age_years} years; equipment replacement history is unknown.`, 'Obtain equipment age, envelope condition and maintenance history to replace this weak vintage proxy.');
  const dependency = .35 * ramp(electricity, 50, 100);
  const cascadeBoost = (100 - hvacBase) * dependency;
  const hvac = hvacBase + cascadeBoost;
  if (cascadeBoost > 0) drivers.push({ system: 'HVAC', parameter: 'electricity_dependency', label: 'Electrical cascade', value: electricity, normalized: dependency, points: cascadeBoost,
    message: `Electricity priority above 50 adds ${cascadeBoost.toFixed(1)} HVAC points through the one-way dependency.`, action: 'Review power continuity for HVAC controls and critical cooling; verify backup circuits and restart procedures.' });
  const revenue = 100 * (b.annual_revenue_usd / (b.annual_revenue_usd + 100000000));
  const weights = { ...WEIGHTS[b.building_type] };
  const contributions = { electricity: weights.electricity * electricity, plumbing: weights.plumbing * plumbing, hvac: weights.hvac * hvac, revenue: weights.revenue * revenue };
  const overall = Object.values(contributions).reduce((a, c) => a + c, 0);
  const band = overall < 25 ? 'Low' : overall < 50 ? 'Moderate' : overall < 75 ? 'High' : 'Critical';
  const warnings = ['Priority index based on screening proxies; not a calibrated failure probability or a safety certification.'];
  if (b.revenue_source === 'scenario' || !b.revenue_source) warnings.push('Revenue is a user-supplied or demonstration scenario, not verified client financial data.');
  if (ref.basis === 'building_type') warnings.push('Uses a broad building-type reference. A matching property-use cohort is preferable.');
  if (ref.report_year && b.report_year && Number(ref.report_year) !== b.report_year) warnings.push(`Reference cohort year ${ref.report_year} differs from reporting year ${b.report_year}; assess time-period comparability before interpreting this scenario.`);
  if (ref.count !== undefined && ref.count < 10) warnings.push(`Small reference cohort (${ref.count} records); compare results cautiously.`);
  if (b.thermal_kbtu_sqft === 0) warnings.push('No non-electric thermal use recorded. This thermal proxy cannot assess all-electric HVAC health.');
  if (b.provenance?.thermal_missing_streams?.length || /unavailable|unknown|subtotal|reported.*streams/i.test(b.thermal_coverage || '')) warnings.push('Thermal intensity is a subtotal of reported streams; unreported streams remain unknown. Review coverage before drawing conclusions.');
  if (b.occupancy_pct !== undefined && Number(b.occupancy_pct) < 80) warnings.push('Low occupancy may distort per-floor-area comparisons; verify operating conditions.');
  return { building: b, scores: { electricity, plumbing, hvacBase, hvac, cascadeBoost, revenue, overall, band, weights, contributions, drivers: drivers.sort((a, c) => c.points - a.points), warnings, reference: ref, modelVersion: MODEL_VERSION } };
}

export function scorePortfolio(buildings, benchmarks = {}) {
  if (!Array.isArray(buildings) || buildings.length === 0) throw new ValidationError(['Supply a non-empty array of buildings.']);
  if (buildings.length > 5000) throw new ValidationError(['The prototype accepts at most 5,000 buildings per file.']);
  const scalar = value => typeof value === 'string' || typeof value === 'number';
  const identity = b => b && scalar(b.building_id) && String(b.building_id).trim() && (b.report_year === undefined || scalar(b.report_year)) ? `${b.building_id}|${b.report_year ?? ''}` : null;
  const weatherGroup = b => b && typeof b.weather_key === 'string' && scalar(b.report_year) ? `${b.weather_key}|${b.report_year}` : null;
  const weather = new Map(), duplicateIds = new Set(), seen = new Set();
  for (const b of buildings) {
    const id = identity(b);
    if (id) {
      if (seen.has(id)) duplicateIds.add(id);
      seen.add(id);
    }
    if (weatherGroup(b)) {
      const key = weatherGroup(b);
      const observed = JSON.stringify([scalar(b.hot_days) ? Number(b.hot_days) : null, scalar(b.freeze_days) ? Number(b.freeze_days) : null]);
      if (!weather.has(key)) weather.set(key, new Set());
      weather.get(key).add(observed);
    }
  }
  const results = buildings.map((b, i) => {
    try {
      if (duplicateIds.has(identity(b))) throw new ValidationError(['Duplicate building_id and report_year. Use one record per building and reporting year.']);
      if (weatherGroup(b) && weather.get(weatherGroup(b)).size > 1) throw new ValidationError(['Conflicting weather values for the same weather_key and report_year. Reconcile the shared weather record.']);
      return scoreBuilding(b, benchmarks);
    } catch (error) {
      return { building: b, row: i + 1, error: error.message, issues: error.issues || [error.message] };
    }
  });
  const valid = results.filter(r => r.scores);
  return { results, summary: { total: results.length, scored: valid.length, invalid: results.length - valid.length,
    average: valid.length ? valid.reduce((a, r) => a + r.scores.overall, 0) / valid.length : null,
    elevated: valid.filter(r => r.scores.overall >= 50).length, cascading: valid.filter(r => r.scores.cascadeBoost > 0).length }, modelVersion: MODEL_VERSION };
}

const buildings = [
  {
    id: "westlake", name: "Westlake Tower", address: "1800 McKinney Ave · Dallas, TX", type: "Class A office", cascadeModifier: 21, trendModifier: 15, maintenanceModifier: 8, trend: 14,
    summary: "A cooling loop pressure drop is drawing more power. If the pump trips, two tenant floors may lose cooling within 40 minutes.", affected: "2 tenant floors at risk", exposure: "$46k estimated exposure", time: "2 min ago", confidence: 87,
    systems: [{ key: "electricity", name: "Electricity", detail: "Pump draw +18% · panel stable", score: 74, icon: "ϟ" }, { key: "plumbing", name: "Plumbing", detail: "Loop pressure below normal", score: 46, icon: "≋" }, { key: "hvac", name: "HVAC", detail: "Cooling output trending down", score: 61, icon: "❄" }],
    cascade: [{ label: "OBSERVED", name: "Loop pressure drop", state: "Plumbing · now", kind: "primary" }, { label: "PREDICTED NEXT", name: "Chiller pump overload", state: "Electricity · ~20 min", kind: "primary" }, { label: "TENANT IMPACT", name: "Cooling loss · floors 8–9", state: "HVAC · ~40 min", kind: "impact-node" }],
    actions: [{ title: "Inspect cooling loop pressure", meta: "Plumbing · dispatch technician", due: "Within 1 hr", level: "high" }, { title: "Check chiller pump current", meta: "Electricity · verify motor load", due: "Within 2 hrs", level: "high" }, { title: "Notify floors 8–9 operations", meta: "Tenant continuity · prepare response", due: "Today", level: "medium" }]
  },
  {
    id: "cedar", name: "Cedar Springs Center", address: "3131 Cedar Springs Rd · Dallas, TX", type: "Mixed-use", cascadeModifier: 16, trendModifier: 14, maintenanceModifier: 7, trend: 8,
    summary: "A main-line water anomaly and after-hours usage suggest a slow leak. Rising humidity can force HVAC to work harder on levels 1–2.", affected: "2 levels exposed", exposure: "$28k estimated exposure", time: "6 min ago", confidence: 79,
    systems: [{ key: "electricity", name: "Electricity", detail: "Normal demand · 3% above baseline", score: 88, icon: "ϟ" }, { key: "plumbing", name: "Plumbing", detail: "Night flow detected · level 1", score: 53, icon: "≋" }, { key: "hvac", name: "HVAC", detail: "Humidity load elevated", score: 64, icon: "❄" }],
    cascade: [{ label: "OBSERVED", name: "Unplanned water flow", state: "Plumbing · now", kind: "primary" }, { label: "PREDICTED NEXT", name: "Moisture / humidity rise", state: "HVAC · ~2 hrs", kind: "primary" }, { label: "TENANT IMPACT", name: "Work areas disrupted", state: "Levels 1–2 · ~5 hrs", kind: "impact-node" }],
    actions: [{ title: "Check level 1 isolation valve", meta: "Plumbing · compare meter flow", due: "Within 2 hrs", level: "high" }, { title: "Inspect adjacent ceiling void", meta: "Building envelope · confirm leak path", due: "Today", level: "medium" }, { title: "Review humidity trend", meta: "HVAC · watch levels 1–2", due: "Today", level: "medium" }]
  },
  {
    id: "legacy", name: "Legacy West North", address: "7700 Windrose Ave · Plano, TX", type: "Office campus", cascadeModifier: 12, trendModifier: -4, maintenanceModifier: 18, trend: -4,
    summary: "A scheduled air handler service is overdue, but power draw, water pressure, and cooling output remain inside normal ranges.", affected: "No tenant impact predicted", exposure: "$4k maintenance exposure", time: "11 min ago", confidence: 92,
    systems: [{ key: "electricity", name: "Electricity", detail: "Demand within seasonal range", score: 92, icon: "ϟ" }, { key: "plumbing", name: "Plumbing", detail: "Pressure stable across zones", score: 94, icon: "≋" }, { key: "hvac", name: "HVAC", detail: "Filter service due in 9 days", score: 72, icon: "❄" }],
    cascade: [{ label: "OBSERVED", name: "Service date approaching", state: "HVAC · 9 days", kind: "primary" }, { label: "PREDICTED NEXT", name: "Reduced airflow possible", state: "HVAC · low likelihood", kind: "primary" }, { label: "TENANT IMPACT", name: "No disruption expected", state: "Monitor · scheduled", kind: "impact-node" }],
    actions: [{ title: "Confirm filter replacement", meta: "HVAC · preventive maintenance", due: "This week", level: "medium" }, { title: "Verify next service window", meta: "Operations · keep planned visit", due: "This week", level: "medium" }]
  },
  {
    id: "park", name: "Park Seventeen", address: "1717 McKinney Ave · Dallas, TX", type: "Retail + office", cascadeModifier: 10, trendModifier: 6, maintenanceModifier: 9, trend: 3,
    summary: "An electrical panel is showing short cycling while domestic water pressure is unstable. The systems share a mechanical room, raising outage exposure.", affected: "Retail level at watch", exposure: "$19k estimated exposure", time: "4 min ago", confidence: 73,
    systems: [{ key: "electricity", name: "Electricity", detail: "Panel cycling detected", score: 58, icon: "ϟ" }, { key: "plumbing", name: "Plumbing", detail: "Pressure fluctuation · zone B", score: 63, icon: "≋" }, { key: "hvac", name: "HVAC", detail: "Normal cooling output", score: 89, icon: "❄" }],
    cascade: [{ label: "OBSERVED", name: "Panel short cycling", state: "Electricity · now", kind: "primary" }, { label: "PREDICTED NEXT", name: "Shared-room access needed", state: "Operations · ~1 hr", kind: "primary" }, { label: "TENANT IMPACT", name: "Retail outage risk", state: "Ground floor · watch", kind: "impact-node" }],
    actions: [{ title: "Check panel connection temperature", meta: "Electricity · infrared inspection", due: "Within 2 hrs", level: "high" }, { title: "Inspect zone B pressure regulator", meta: "Plumbing · mechanical room", due: "Today", level: "medium" }, { title: "Confirm retail backup circuit", meta: "Continuity · validate transfer", due: "Today", level: "medium" }]
  }
];

const signals = [
  { severity: "high", name: "Cooling loop pressure below threshold", building: "Westlake Tower", system: "Plumbing", time: "2 min ago", confidence: "94%", status: "New" },
  { severity: "high", name: "Chiller pump power draw +18%", building: "Westlake Tower", system: "Electricity", time: "5 min ago", confidence: "87%", status: "Investigating" },
  { severity: "medium", name: "After-hours water flow detected", building: "Cedar Springs Center", system: "Plumbing", time: "6 min ago", confidence: "79%", status: "New" },
  { severity: "medium", name: "Humidity rising above normal", building: "Cedar Springs Center", system: "HVAC", time: "9 min ago", confidence: "83%", status: "Monitoring" },
  { severity: "low", name: "Air handler service due in 9 days", building: "Legacy West North", system: "HVAC", time: "11 min ago", confidence: "92%", status: "Assigned" },
  { severity: "medium", name: "Electrical panel short cycling", building: "Park Seventeen", system: "Electricity", time: "4 min ago", confidence: "73%", status: "New" },
  { severity: "low", name: "Domestic pressure fluctuation · zone B", building: "Park Seventeen", system: "Plumbing", time: "12 min ago", confidence: "71%", status: "Monitoring" },
  { severity: "medium", name: "Supply temperature drift", building: "Westlake Tower", system: "HVAC", time: "18 min ago", confidence: "76%", status: "New" }
];

let selectedBuilding = 0;
let visibleSignals = 5;
let systemFilter = "All systems";
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const current = () => buildings[selectedBuilding];

function levelFor(score) { return score >= 75 ? "Critical" : score >= 60 ? "Elevated" : score >= 45 ? "Watch" : "Low"; }
function classFor(score) { return score >= 75 ? "critical" : score >= 60 ? "high" : score >= 45 ? "watch" : "low"; }
function healthClass(score) { return score < 55 ? "bad" : score < 75 ? "watch" : "good"; }
function riskScore(b) {
  const systems = Object.fromEntries(b.systems.map((system) => [system.key, 100 - system.score]));
  const weightedSystemRisk = systems.electricity * 0.4 + systems.plumbing * 0.3 + systems.hvac * 0.3;
  return Math.max(0, Math.min(100, Math.round(weightedSystemRisk + b.cascadeModifier + b.trendModifier + b.maintenanceModifier)));
}

function renderBuilding() {
  const b = current();
  b.score = riskScore(b);
  $("#buildingName").textContent = b.name;
  $("#buildingAddress").textContent = b.address;
  $("#buildingType").textContent = b.type;
  $("#buildingSelectText").textContent = "Switch property";
  $("#riskScore").textContent = b.score;
  $("#scoreRing").style.background = `conic-gradient(${b.score >= 75 ? "#d46554" : b.score >= 60 ? "#d49a4d" : b.score >= 45 ? "#c4a765" : "#70a77b"} 0 ${b.score}%, #f0e6e1 ${b.score}% 100%)`;
  const pill = $("#riskLevel"); pill.className = `status-pill ${classFor(b.score)}`; pill.innerHTML = `<i></i>${levelFor(b.score)}`;
  $(".score-trend").textContent = `${b.trend > 0 ? "↑" : "↓"} ${Math.abs(b.trend)} pts this week`;
  $("#riskSummary").textContent = b.summary;
  $("#affectedTag").textContent = b.affected;
  $("#exposureTag").textContent = b.exposure;
  $("#signalTime").textContent = b.time;
  $("#confidence").textContent = `${b.confidence}%`;
  $("#systemList").innerHTML = b.systems.map((s) => {
    const cls = healthClass(s.score);
    return `<div class="system-row"><span class="system-icon ${s.key}">${s.icon}</span><div><div class="system-name">${s.name}</div><div class="system-note">${s.detail}</div></div><span class="system-health ${cls}">${s.score} / 100</span><span class="health-track ${cls}"><span style="width:${s.score}%"></span></span></div>`;
  }).join("");
  $("#cascadeMap").innerHTML = b.cascade.map((node, i) => `${i ? '<span class="cascade-connector" aria-hidden="true"></span>' : ""}<div class="cascade-node ${node.kind}"><div class="node-label">${node.label}</div><div class="node-name">${node.name}</div><div class="node-state"><i></i>${node.state}</div></div>`).join("");
  $("#actionCount").textContent = b.actions.length;
  $("#actionList").innerHTML = b.actions.map((a) => `<div class="action-row"><span class="priority-bar ${a.level === "medium" ? "medium" : ""}"></span><div class="action-copy"><b>${a.title}</b><small>${a.meta}</small></div><span class="action-due">${a.due}</span></div>`).join("");
  renderSignals();
}

function renderSignals() {
  const data = signals.filter((s) => systemFilter === "All systems" || s.system === systemFilter).slice(0, visibleSignals);
  $("#signalRows").innerHTML = data.map((s) => `<tr><td><span class="signal-name"><i class="severity-mark ${s.severity === "medium" ? "medium" : s.severity === "low" ? "low" : ""}"></i>${s.name}</span></td><td>${s.building}</td><td><span class="system-chip ${s.system.toLowerCase()}">${s.system}</span></td><td>${s.time}</td><td class="confidence-cell">${s.confidence}</td><td><span class="table-status ${s.status === "Assigned" ? "assigned" : s.status === "Monitoring" ? "monitoring" : ""}">${s.status}</span></td></tr>`).join("");
  $("#showingCount").textContent = data.length;
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("visible"), 2900);
}

function openDependency() {
  const b = current();
  $("#modalText").textContent = b.summary;
  $("#modalPath").innerHTML = b.cascade.map((n) => `<div class="path-step"><span class="path-dot"></span><b>${n.name}</b><small>${n.state}</small></div>`).join("");
  $("#modalImpact").textContent = `${b.affected}. ${b.exposure}. Confidence reflects agreement between current meter readings, equipment behavior, and recent maintenance signals.`;
  $("#modalTitle").textContent = `${b.name}: predicted cascade`;
  $("#modalBackdrop").hidden = false;
}

$("#buildingSelect").addEventListener("click", () => {
  selectedBuilding = (selectedBuilding + 1) % buildings.length;
  renderBuilding();
  showToast(`Showing ${current().name}`);
});
$("#scanBtn").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.disabled = true; button.innerHTML = '<span class="button-icon">✓</span>Scan complete';
  $("#footerTime").textContent = "just now";
  $("#signalTime").textContent = "just now";
  showToast("Portfolio scan complete · 3 new cross-system links found");
  setTimeout(() => { button.disabled = false; button.innerHTML = '<span class="button-icon">↻</span>Run portfolio scan'; }, 2500);
});
$("#exportBtn").addEventListener("click", () => {
  const rows = [["Property", "Risk score", "System", "Health", "Latest signal"], ...buildings.flatMap((b) => b.systems.map((s) => [b.name, riskScore(b), s.name, s.score, s.detail]))];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "signal-house-risk-report.csv"; anchor.click(); URL.revokeObjectURL(url);
  showToast("Portfolio report exported");
});
$("#seeAllBtn").addEventListener("click", () => { visibleSignals = signals.length; $("#signals").scrollIntoView({ behavior: "smooth" }); renderSignals(); });
$("#allSignalsBtn").addEventListener("click", () => { visibleSignals = signals.length; renderSignals(); showToast("Showing all recent demo signals"); });
$("#nextSignalsBtn").addEventListener("click", () => { visibleSignals = signals.length; renderSignals(); showToast("Loaded more recent signals"); });
$("#traceBtn").addEventListener("click", openDependency);
$("#cascadeBtn").addEventListener("click", openDependency);
$("#systemMethodBtn").addEventListener("click", () => { document.querySelector("#method")?.scrollIntoView({ behavior: "smooth" }) || showToast("System scores combine anomaly severity, trend, and maintenance context"); });
$("#buildingDetailsBtn").addEventListener("click", () => showToast(`${current().name} · ${current().type} · demo building profile`));
$("#createWorkOrderBtn").addEventListener("click", (event) => {
  event.currentTarget.innerHTML = 'Work order drafted <span>✓</span>';
  event.currentTarget.classList.add("created");
  showToast(`Drafted ${current().actions.length} prioritized work orders for ${current().name}`);
  setTimeout(() => { event.currentTarget.innerHTML = 'Create work order <span>＋</span>'; event.currentTarget.classList.remove("created"); }, 3000);
});
$("#filterBtn").addEventListener("click", () => {
  const options = ["All systems", "Electricity", "Plumbing", "HVAC"];
  systemFilter = options[(options.indexOf(systemFilter) + 1) % options.length];
  $("#filterBtn").innerHTML = `${systemFilter} <span>⌄</span>`;
  visibleSignals = 5; renderSignals();
});
$("#windowSelect").addEventListener("click", (event) => {
  const windows = ["Next 24 hours", "Next 48 hours", "Next 7 days"];
  const currentWindow = event.currentTarget.dataset.window || windows[0];
  const nextWindow = windows[(windows.indexOf(currentWindow) + 1) % windows.length];
  event.currentTarget.dataset.window = nextWindow;
  event.currentTarget.innerHTML = `${nextWindow} <span>⌄</span>`;
  showToast(`Showing predicted impacts: ${nextWindow.toLowerCase()}`);
});
$("#modalClose").addEventListener("click", () => { $("#modalBackdrop").hidden = true; });
$("#modalDone").addEventListener("click", () => { $("#modalBackdrop").hidden = true; });
$("#modalBackdrop").addEventListener("click", (event) => { if (event.target.id === "modalBackdrop") event.currentTarget.hidden = true; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") $("#modalBackdrop").hidden = true; });
renderBuilding();

/* EcoRoute Fleet Console — demo data, routing model and UI.
 * Runs entirely in the browser; no build step, no backend. */

/* ---------- Demo data (fictional fleet on a sample city layout) ---------- */
const WAREHOUSE = { name: 'Central Hub', lat: 12.9716, lng: 77.5946 };

const STOPS = [
  { name: 'Indiranagar',     lat: 12.9784, lng: 77.6408 },
  { name: 'Koramangala',     lat: 12.9352, lng: 77.6245 },
  { name: 'Whitefield',      lat: 12.9698, lng: 77.7500 },
  { name: 'Jayanagar',       lat: 12.9308, lng: 77.5838 },
  { name: 'Malleshwaram',    lat: 13.0031, lng: 77.5643 },
  { name: 'HSR Layout',      lat: 12.9116, lng: 77.6389 },
  { name: 'Hebbal',          lat: 13.0358, lng: 77.5970 },
  { name: 'Electronic City', lat: 12.8399, lng: 77.6770 },
  { name: 'Yeshwanthpur',    lat: 13.0280, lng: 77.5400 },
  { name: 'Banashankari',    lat: 12.9255, lng: 77.5468 },
  { name: 'MG Road',         lat: 12.9756, lng: 77.6066 },
  { name: 'Marathahalli',    lat: 12.9591, lng: 77.6974 }
];

const CHARGERS = [
  { name: 'Rajajinagar Fast Charge', lat: 12.9915, lng: 77.5550 },
  { name: 'Silk Board Charge Hub',   lat: 12.9176, lng: 77.6233 },
  { name: 'Airport Road Charger',    lat: 13.0000, lng: 77.6700 },
  { name: 'Bannerghatta Charger',    lat: 12.8870, lng: 77.5970 }
];

const VEHICLES = [
  { id: 'EV-01', name: 'Van Alpha',     battery: 78, cargo: 64, status: 'Active',   stops: [0, 1, 5],  color: '#22c55e' },
  { id: 'EV-02', name: 'Van Bravo',     battery: 42, cargo: 80, status: 'Active',   stops: [2, 11, 6], color: '#38bdf8' },
  { id: 'EV-03', name: 'Truck Charlie', battery: 61, cargo: 35, status: 'Active',   stops: [3, 9, 4],  color: '#f472b6' },
  { id: 'EV-04', name: 'Van Delta',     battery: 15, cargo: 50, status: 'Charging', stops: [6, 8, 10], color: '#facc15' }
];

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function hav(a, b) {
  const R = 6371, t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearest(list, pt) {
  let best = list[0], bd = Infinity;
  list.forEach(c => { const d = hav(pt, c); if (d < bd) { bd = d; best = c; } });
  return { ...best };
}

/* Nearest-neighbour ordering of each vehicle's stops, hub -> stops -> hub */
VEHICLES.forEach(v => {
  const remaining = v.stops.map(i => ({ ...STOPS[i], type: 'stop' }));
  let cur = WAREHOUSE;
  const route = [{ ...WAREHOUSE, type: 'hub' }];
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((s, i) => { const d = hav(cur, s); if (d < bd) { bd = d; bi = i; } });
    cur = remaining.splice(bi, 1)[0];
    route.push(cur);
  }
  route.push({ ...WAREHOUSE, type: 'hub' });
  v.route = route;
});

/* ---------- Route + energy model (illustrative, not calibrated) ---------- */
const state = { payload: 50, elev: 40, traffic: 60, ev: 70, sel: 0 };
const PACK_KWH = 60;

// Insert a charging stop mid-route for low-battery vans when EV preference is on
function ecoNodes(v, p) {
  const nodes = v.route.map(n => ({ ...n }));
  if (p.ev > 20 && v.battery < 50 && nodes.length > 2) {
    const mid = Math.floor(nodes.length / 2);
    nodes.splice(mid, 0, { ...nearest(CHARGERS, nodes[mid]), type: 'charge' });
  }
  return nodes;
}

// Eco path bends around legs; bend size grows with traffic avoidance
function buildEcoPath(v, p) {
  const nodes = ecoNodes(v, p);
  const off = 0.001 + 0.004 * (p.traffic / 100);
  const pts = [[nodes[0].lat, nodes[0].lng]];
  const nodeCum = [0];
  let cum = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const dLat = b.lat - a.lat, dLng = b.lng - a.lng;
    const sign = i % 2 ? 1 : -1;
    const mid = { lat: (a.lat + b.lat) / 2 - dLng * off * sign, lng: (a.lng + b.lng) / 2 + dLat * off * sign };
    cum += hav(a, mid) + hav(mid, b);
    pts.push([mid.lat, mid.lng], [b.lat, b.lng]);
    nodeCum.push(cum);
  }
  return { nodes, pts, nodeCum, km: cum };
}

function computeVehicle(v, p) {
  const payloadMult = 1 + 0.35 * (p.payload / 100) * (v.cargo / 100);
  const elevStd = 1 + 0.5 * (p.elev / 100);
  const elevEco = 1 + 0.5 * (p.elev / 100) * 0.4;   // routing avoids steep grades
  const trafStd = 1 + 0.15 * (p.traffic / 100);     // idling in congestion
  const trafEco = 1 + 0.05 * (p.traffic / 100);
  const ev = p.ev / 100;

  let stdKm = 0;
  for (let i = 1; i < v.route.length; i++) stdKm += hav(v.route[i - 1], v.route[i]);

  const eco = buildEcoPath(v, p);

  const stdL = stdKm * 0.28 * payloadMult * elevStd * trafStd;
  const stdCO2 = stdL * 2.68;

  const ecoDieselL = (1 - ev) * eco.km * 0.28 * payloadMult * elevEco * trafEco;
  const ecoKwh = ev * eco.km * 0.22 * payloadMult * elevEco;
  const ecoCO2 = ecoDieselL * 2.68 + ecoKwh * 0.70;

  return {
    stdKm, ecoKm: eco.km, eco, stdL, ecoDieselL, ecoKwh, stdCO2, ecoCO2,
    co2Saved: stdCO2 - ecoCO2,
    fuelSaved: stdL - ecoDieselL
  };
}

/* ---------- Map ---------- */
const map = L.map('map').setView([12.97, 77.60], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);

const routeLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const simLayer = L.layerGroup().addTo(map);

const hubIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#fff;border:3px solid #22c55e;border-radius:4px;box-shadow:0 0 10px #22c55e"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9]
});
const chargerIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#38bdf8;border:2px solid #03140a;border-radius:50%;text-align:center;line-height:14px;font-size:10px;color:#03140a;font-weight:700">⚡</div>',
  iconSize: [18, 18], iconAnchor: [9, 9]
});

L.marker([WAREHOUSE.lat, WAREHOUSE.lng], { icon: hubIcon }).bindTooltip(`<b>${WAREHOUSE.name}</b>`).addTo(markerLayer);
CHARGERS.forEach(c => L.marker([c.lat, c.lng], { icon: chargerIcon }).bindTooltip(`⚡ ${c.name}`).addTo(markerLayer));
STOPS.forEach(s => L.circleMarker([s.lat, s.lng], {
  radius: 6, color: '#0b1210', weight: 2, fillColor: '#e6f2ec', fillOpacity: 1
}).bindTooltip(s.name).addTo(markerLayer));

/* ---------- Trip simulation helpers ---------- */
function positionAt(res, t) {
  const s = t * res.ecoKm;
  const pts = res.eco.pts;
  let acc = 0, lat = pts[0][0], lng = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const a = { lat: pts[i - 1][0], lng: pts[i - 1][1] }, b = { lat: pts[i][0], lng: pts[i][1] };
    const d = hav(a, b);
    if (acc + d >= s) {
      const f = d ? (s - acc) / d : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, s };
    }
    acc += d; lat = b.lat; lng = b.lng;
  }
  return { lat, lng, s };
}

function currentLeg(res, s) {
  const nodes = res.eco.nodes, cum = res.eco.nodeCum;
  let k = 0;
  while (k < cum.length - 2 && cum[k + 1] <= s) k++;
  return { to: nodes[k + 1], nextTo: nodes[k + 2], remainingLeg: Math.max(0, cum[k + 1] - s) };
}

function describe(n) {
  if (!n) return '–';
  if (n.type === 'hub') return 'Return to ' + n.name;
  if (n.type === 'charge') return 'Charge at ' + n.name;
  return 'Deliver at ' + n.name;
}

/* ---------- Rendering ---------- */
let results = [];

function render() {
  results = VEHICLES.map(v => computeVehicle(v, state));

  const totCO2 = results.reduce((a, r) => a + r.co2Saved, 0);
  const totFuel = results.reduce((a, r) => a + r.fuelSaved, 0);
  const totStd = results.reduce((a, r) => a + r.stdL, 0);
  const totEcoL = results.reduce((a, r) => a + r.ecoDieselL, 0);
  const gain = totStd > 0 ? (totStd - totEcoL) / totStd : 0;
  const active = VEHICLES.filter(v => v.status === 'Active').length;
  const avgBat = VEHICLES.reduce((a, v) => a + v.battery, 0) / VEHICLES.length;

  $('#kCO2').textContent = fmt(totCO2, 1);
  $('#kCO2sub').textContent = `kg CO₂ · ≈ ${fmt(totCO2 / 21, 1)} tree-years`;
  $('#kFuel').textContent = fmt(totFuel, 1) + ' L';
  $('#kEnergy').textContent = fmt(gain * 100, 0) + '%';
  $('#kFleet').textContent = `${active}/${VEHICLES.length}`;
  $('#kFleetSub').textContent = `active · avg battery ${fmt(avgBat, 0)}%`;

  // Route layers
  routeLayer.clearLayers();
  VEHICLES.forEach((v, i) => {
    const r = results[i];
    L.polyline(v.route.map(n => [n.lat, n.lng]), { color: '#9ca3af', weight: 3, dashArray: '6 8', opacity: .55 }).addTo(routeLayer);
    L.polyline(r.eco.pts, {
      color: v.color, weight: i === state.sel ? 6 : 4, opacity: i === state.sel ? 1 : .7
    }).bindTooltip(`${v.id} · ${fmt(r.ecoKm)} km eco`).addTo(routeLayer);
    r.eco.nodes.forEach(n => {
      if (n.type === 'stop') L.circleMarker([n.lat, n.lng], { radius: 5, color: v.color, fillColor: '#0b1210', fillOpacity: 1, weight: 2 }).addTo(routeLayer);
    });
  });

  // Fleet cards
  $('#fleetCards').innerHTML = VEHICLES.map((v, i) => {
    const r = results[i];
    return `
      <div class="vcard ${i === state.sel ? 'sel' : ''}" data-i="${i}">
        <div class="vhead"><b>${v.id} · ${v.name}</b><span class="chip ${v.status === 'Charging' ? 'charging' : ''}">${v.status}</span></div>
        <div class="meta"><span>EV battery</span><span>${v.battery}%</span></div>
        <div class="bar"><i style="width:${v.battery}%"></i></div>
        <div class="meta"><span>Cargo</span><span>${v.cargo}%</span></div>
        <div class="bar cargo"><i style="width:${v.cargo}%"></i></div>
        <div class="meta"><span>Eco route</span><span>${fmt(r.ecoKm)} km · ${v.route.length - 2} stops</span></div>
      </div>`;
  }).join('');
  document.querySelectorAll('.vcard').forEach(el =>
    el.addEventListener('click', () => { state.sel = +el.dataset.i; resetSim(); render(); }));

  // Carbon chart
  const maxVal = Math.max(1, ...results.map(r => Math.max(r.stdCO2, r.ecoCO2)));
  $('#chart').innerHTML = VEHICLES.map((v, i) => {
    const r = results[i];
    return `
      <div class="chart-row">
        <div class="name"><span>${v.id}</span><b style="color:var(--eco)">−${fmt(r.co2Saved)} kg</b></div>
        <div class="pair">
          <div class="b std" style="width:${(r.stdCO2 / maxVal * 100).toFixed(1)}%">${fmt(r.stdCO2)}</div>
          <div class="b eco" style="width:${(Math.max(r.ecoCO2, 0) / maxVal * 100).toFixed(1)}%">${fmt(r.ecoCO2)}</div>
        </div>
      </div>`;
  }).join('') + `<div class="muted">Fleet saved <b style="color:var(--eco)">${fmt(totCO2)} kg CO₂</b> today</div>`;

  $('#simVehicle').textContent = VEHICLES[state.sel].id;
  updateSim();
  updateDriver();
}

/* ---------- Sliders ---------- */
[['pPayload', 'vPayload', 'payload'], ['pElev', 'vElev', 'elev'],
 ['pTraffic', 'vTraffic', 'traffic'], ['pEv', 'vEv', 'ev']].forEach(([inp, out, key]) => {
  const el = document.getElementById(inp);
  el.addEventListener('input', () => {
    state[key] = +el.value;
    document.getElementById(out).textContent = el.value + '%';
    render();
  });
});

/* ---------- Trip simulator + driver state ---------- */
const sim = { playing: false, t: 0, last: 0 };
const SIM_SECONDS = 40;

function resetSim() { sim.t = 0; sim.playing = false; setPlayLabel(); }

function setPlayLabel() {
  $('#playBtn').textContent = sim.playing ? '❚❚ Pause' : '▶ Play';
  $('#dPlay').textContent = sim.playing ? '❚❚ Pause' : (sim.t > 0 && sim.t < 1 ? '▶ Resume' : '▶ Start trip');
}

// Shared snapshot used by both the fleet simulator and the driver view
function snapshot() {
  const v = VEHICLES[state.sel], res = results[state.sel];
  const p = positionAt(res, sim.t);
  const leg = currentLeg(res, p.s);
  const remainKm = Math.max(0, res.ecoKm - p.s);
  const bat = Math.max(0, v.battery - (res.ecoKwh / PACK_KWH) * 100 * sim.t);
  return { v, res, p, leg, remainKm, bat, etaMin: Math.round(remainKm / 28 * 60) };
}

function updateSim() {
  const s = snapshot();
  $('#simPct').textContent = Math.round(sim.t * 100) + '%';
  $('#simBar').style.width = (sim.t * 100) + '%';
  $('#simRem').textContent = fmt(s.remainKm) + ' km';
  $('#simBat').textContent = fmt(s.bat, 0) + '%';
  $('#simNext').textContent = s.leg.to ? s.leg.to.name : 'Done';

  simLayer.clearLayers();
  L.circleMarker([s.p.lat, s.p.lng], { radius: 10, color: '#fff', weight: 3, fillColor: s.v.color, fillOpacity: 1 })
    .bindTooltip(`${s.v.id} · ${fmt(s.bat, 0)}%`).addTo(simLayer);
}

function updateDriver() {
  const s = snapshot();
  $('#dVehicle').textContent = `${s.v.id} · ${s.v.name}`;
  $('#dLeftTop').textContent = `${fmt(s.remainKm)} km left`;
  $('#dTurn').textContent = s.leg.to && s.leg.to.type === 'charge' ? 'Charging stop' : 'Next stop';
  $('#dStep').textContent = s.leg.to ? describe(s.leg.to) : 'Trip complete';
  $('#dDist').textContent = s.leg.to ? fmt(s.leg.remainingLeg) + ' km' : '—';
  $('#dThen').textContent = s.leg.nextTo ? describe(s.leg.nextTo) : 'Trip complete';
  $('#dLeft').textContent = fmt(s.remainKm) + ' km';
  $('#dEta').textContent = s.etaMin + ' min';
  $('#dBat').textContent = fmt(s.bat, 0) + '%';
  $('#dBar').style.width = (sim.t * 100) + '%';
}

function tick(ts) {
  if (sim.playing) {
    const dt = sim.last ? (ts - sim.last) / 1000 : 0;
    sim.t = Math.min(1, sim.t + dt / SIM_SECONDS);
    if (sim.t >= 1) sim.playing = false;
    updateSim();
    updateDriver();
    setPlayLabel();
  }
  sim.last = ts;
  requestAnimationFrame(tick);
}

function togglePlay() {
  if (sim.t >= 1) sim.t = 0;
  sim.playing = !sim.playing;
  sim.last = 0;
  setPlayLabel();
}
$('#playBtn').addEventListener('click', togglePlay);
$('#dPlay').addEventListener('click', togglePlay);
$('#resetBtn').addEventListener('click', () => { resetSim(); updateSim(); updateDriver(); });

/* ---------- Mode toggle ---------- */
function setMode(mode) {
  const driver = mode === 'driver';
  $('#fleetView').classList.toggle('hidden', driver);
  $('#driverView').classList.toggle('hidden', !driver);
  $('#modeFleet').classList.toggle('on', !driver);
  $('#modeDriver').classList.toggle('on', driver);
  $('#modeFleet').setAttribute('aria-selected', String(!driver));
  $('#modeDriver').setAttribute('aria-selected', String(driver));
  if (driver) updateDriver();
  setTimeout(() => map.invalidateSize(), 50);
}
$('#modeFleet').addEventListener('click', () => setMode('fleet'));
$('#modeDriver').addEventListener('click', () => setMode('driver'));

/* ---------- Boot ---------- */
render();
const bounds = L.latLngBounds([WAREHOUSE.lat, WAREHOUSE.lng]);
STOPS.forEach(s => bounds.extend([s.lat, s.lng]));
map.fitBounds(bounds, { padding: [30, 30] });
setPlayLabel();
requestAnimationFrame(tick);

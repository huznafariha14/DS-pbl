// Admin & Ops Monitoring Module — with Peak Hours Analytics
async function loadAdminDashboard() {
  await Promise.all([
    fetchAdminMetrics(),
    fetchAuditLogs(),
    fetchPeakHoursAnalytics()
  ]);
}

async function fetchAdminMetrics() {
  try {
    const res = await fetch('/api/admin/metrics');
    if (!res.ok) throw new Error("Failed to load admin metrics");
    const data = await res.json();
    renderAdminMetrics(data);
  } catch (err) {
    console.error("Error loading admin metrics:", err);
  }
}

function renderAdminMetrics(data) {
  const stats = data.system_stats;
  document.getElementById('admin_total_quotes').textContent = stats.total_quotes_generated;
  document.getElementById('admin_surge_capped_pct').textContent = `${stats.surge_capped_pct}% (${stats.capped_surge_quotes})`;
  document.getElementById('admin_min_floor_pct').textContent = `${stats.min_floor_pct}% (${stats.min_floor_protected_quotes})`;
  document.getElementById('admin_drift_status').textContent = stats.model_drift_status;

  // Active Policy Sliders
  const pol = stats.active_fairness_policy;
  document.getElementById('cfg_base_fare').value = pol.base_fare;
  document.getElementById('val_base_fare').textContent = `$${pol.base_fare.toFixed(2)}`;

  document.getElementById('cfg_max_surge').value = pol.max_surge_cap;
  document.getElementById('val_max_surge').textContent = `${pol.max_surge_cap.toFixed(1)}x`;

  document.getElementById('cfg_min_floor').value = pol.min_driver_floor;
  document.getElementById('val_min_floor').textContent = `$${pol.min_driver_floor.toFixed(2)}`;

  document.getElementById('cfg_driver_split').value = pol.driver_split_pct * 100;
  document.getElementById('val_driver_split').textContent = `${Math.round(pol.driver_split_pct * 100)}%`;

  // Render Model Comparison Table
  const tbody = document.getElementById('admin_models_table_body');
  tbody.replaceChildren();

  const bm = data.model_benchmarks;
  for (const [key, model] of Object.entries(bm)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${model.version}</strong></td>
      <td>$${model.mae.toFixed(2)}</td>
      <td>$${model.rmse.toFixed(2)}</td>
      <td style="font-weight:700; color: var(--accent-cyan);">${model.r2.toFixed(4)}</td>
      <td><span class="badge badge-emerald">ACTIVE</span></td>
    `;
    tbody.appendChild(tr);
  }
}

async function fetchAuditLogs(searchQuery = '') {
  try {
    const url = searchQuery ? `/api/admin/audit-logs?search=${encodeURIComponent(searchQuery)}` : '/api/admin/audit-logs';
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load audit logs");
    const data = await res.json();
    renderAuditLogs(data.logs);
  } catch (err) {
    console.error("Error loading audit logs:", err);
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('audit_logs_table_body');
  tbody.replaceChildren();

  if (logs.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">No audit logs found matching criteria.</td>`;
    tbody.appendChild(tr);
    return;
  }

  logs.forEach(log => {
    const tr = document.createElement('tr');
    const surgeBadge = log.is_surge_capped ? `<span class="badge badge-amber">${log.applied_surge}x (Capped)</span>` : `<span class="badge badge-indigo">${log.applied_surge}x</span>`;
    const statusBadge = log.status === 'BOOKED' ? `<span class="badge badge-emerald">BOOKED</span>` : `<span class="badge badge-indigo">${log.status}</span>`;

    tr.innerHTML = `
      <td><strong>${log.quote_id}</strong></td>
      <td>${new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
      <td>$${log.ml_prediction.toFixed(2)}</td>
      <td>${surgeBadge}</td>
      <td style="font-weight:600;">$${log.rider_fare.toFixed(2)}</td>
      <td style="font-weight:600; color: var(--accent-emerald);">$${log.driver_payout.toFixed(2)}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
//  PEAK HOURS ANALYTICS
// ============================================================
async function fetchPeakHoursAnalytics() {
  try {
    const res = await fetch('/api/admin/peak-hours-analytics');
    if (!res.ok) throw new Error("Failed to load peak hours data");
    const data = await res.json();
    renderPeakHoursPanel(data);
  } catch (err) {
    console.error("Error loading peak hours analytics:", err);
    const el = document.getElementById('peak_hours_panel');
    if (el) el.innerHTML = `<p style="color:var(--text-muted);text-align:center;">Could not load peak hours data.</p>`;
  }
}

function surgeToColor(surge) {
  // Gradient: quiet=indigo → busy=amber → rush=rose
  if (surge >= 1.6) return `rgba(244, 63, 94, ${0.5 + (surge - 1.6) * 0.5})`;
  if (surge >= 1.2) return `rgba(245, 158, 11, ${0.4 + (surge - 1.2) * 0.75})`;
  return `rgba(99, 102, 241, ${0.3 + (surge - 1.0) * 0.5})`;
}

function renderPeakHoursPanel(data) {
  const container = document.getElementById('peak_hours_panel');
  if (!container) return;

  const { hourly_data, summary } = data;
  const maxVol = Math.max(...hourly_data.map(h => h.ride_volume));
  const maxSurge = Math.max(...hourly_data.map(h => h.avg_surge_multiplier));

  container.innerHTML = `
    <!-- Summary KPI Cards -->
    <div class="peak-summary-cards">
      <div class="stat-card amber">
        <div class="stat-title">Peak Surge Hour</div>
        <div class="stat-value" style="font-size:1.5rem;">${summary.peak_surge_hour}</div>
        <div class="stat-sub">${summary.peak_surge_value}x avg surge multiplier</div>
      </div>
      <div class="stat-card emerald">
        <div class="stat-title">Busiest Hour</div>
        <div class="stat-value" style="font-size:1.5rem;">${summary.busiest_hour}</div>
        <div class="stat-sub">${summary.busiest_volume} rides (est. volume)</div>
      </div>
      <div class="stat-card indigo">
        <div class="stat-title">Avg Daily Surge</div>
        <div class="stat-value" style="font-size:1.5rem;">${summary.avg_daily_surge}x</div>
        <div class="stat-sub">${summary.live_data_hours} hrs with live data</div>
      </div>
    </div>

    <!-- Heatmap Row -->
    <div style="margin-bottom:0.6rem;">
      <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:0.4rem;">
        🌡️ Surge Intensity Heatmap (hover for details)
      </div>
      <div class="heatmap-grid" id="peak_heatmap"></div>
    </div>

    <!-- Bar Chart -->
    <div style="margin-bottom:0.5rem;">
      <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:0.6rem;">
        📊 Ride Volume & Avg Fare by Hour
      </div>
      <div class="peak-chart-wrap">
        <div class="peak-chart" id="peak_bar_chart"></div>
      </div>
    </div>

    <div class="peak-legend">
      <div class="peak-legend-item">
        <div class="peak-legend-dot" style="background:rgba(244,63,94,0.8);"></div> Peak/Rush (≥1.6x)
      </div>
      <div class="peak-legend-item">
        <div class="peak-legend-dot" style="background:rgba(245,158,11,0.8);"></div> Moderate/Busy (1.2–1.6x)
      </div>
      <div class="peak-legend-item">
        <div class="peak-legend-dot" style="background:rgba(99,102,241,0.7);"></div> Off-Peak/Quiet (<1.2x)
      </div>
      <div class="peak-legend-item">
        <div class="peak-legend-dot" style="background:rgba(16,185,129,0.8);border:1px solid rgba(16,185,129,0.5)"></div> 🟢 Live Data
      </div>
    </div>

    <!-- Detailed Table -->
    <details style="margin-top:1.25rem;">
      <summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--accent-cyan);padding:0.5rem 0;">
        📋 View Full 24-Hour Rate Record Table
      </summary>
      <div class="table-responsive" style="margin-top:0.75rem;">
        <table class="custom-table" id="peak_detail_table">
          <thead>
            <tr>
              <th>Hour</th>
              <th>Period</th>
              <th>Avg Surge</th>
              <th>Avg Fare</th>
              <th>Ride Volume</th>
              <th>Demand Index</th>
              <th>Driver Floor %</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody id="peak_table_body"></tbody>
        </table>
      </div>
    </details>
  `;

  // Render heatmap cells
  const heatmapEl = document.getElementById('peak_heatmap');
  hourly_data.forEach(h => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.style.background = surgeToColor(h.avg_surge_multiplier);
    if (h.is_live_data) cell.style.outline = '1.5px solid rgba(16,185,129,0.7)';
    cell.innerHTML = `
      <div class="heatmap-cell-label">${h.hour_label.replace(':00','')}</div>
      <div class="heatmap-tooltip">
        <strong>${h.hour_label}</strong> — ${h.period}<br>
        Surge: ${h.avg_surge_multiplier}x<br>
        Avg Fare: $${h.avg_rider_fare}<br>
        Volume: ${h.ride_volume}
      </div>
    `;
    heatmapEl.appendChild(cell);
  });

  // Render bar chart (volume bars)
  const chartEl = document.getElementById('peak_bar_chart');
  hourly_data.forEach(h => {
    const colHeight = Math.max(8, Math.round((h.ride_volume / maxVol) * 140));
    const col = document.createElement('div');
    col.className = 'peak-bar-col';
    col.title = `${h.hour_label}: ${h.ride_volume} rides, $${h.avg_rider_fare} avg`;

    const bar = document.createElement('div');
    bar.className = 'peak-bar';
    bar.style.height = '0px';
    bar.style.background = surgeToColor(h.avg_surge_multiplier);
    if (h.is_live_data) bar.style.boxShadow = `0 0 6px ${surgeToColor(h.avg_surge_multiplier)}`;

    const label = document.createElement('div');
    label.className = 'peak-bar-label';
    label.textContent = h.hour_label.replace(':00', '');

    col.appendChild(bar);
    col.appendChild(label);
    chartEl.appendChild(col);

    // Animate bar in
    setTimeout(() => { bar.style.height = `${colHeight}px`; }, 50 + h.hour * 18);
  });

  // Render detail table
  const tbody = document.getElementById('peak_table_body');
  hourly_data.forEach(h => {
    const tr = document.createElement('tr');
    const periodBadge = h.badge === 'RUSH' 
      ? `<span class="badge" style="background:rgba(244,63,94,0.2);color:#fb7185;border:1px solid rgba(244,63,94,0.3);">RUSH</span>`
      : h.badge === 'BUSY'
        ? `<span class="badge badge-amber">BUSY</span>`
        : `<span class="badge badge-indigo">QUIET</span>`;
    const liveTag = h.is_live_data 
      ? `<span class="badge badge-emerald" style="font-size:0.65rem;">LIVE</span>`
      : `<span class="badge" style="background:rgba(148,163,184,0.1);color:#64748b;border:1px solid rgba(148,163,184,0.2);font-size:0.65rem;">BASE</span>`;

    tr.innerHTML = `
      <td><strong>${h.hour_label}</strong></td>
      <td>${periodBadge}</td>
      <td style="font-weight:700;color:${h.avg_surge_multiplier >= 1.5 ? '#fb7185' : h.avg_surge_multiplier >= 1.2 ? '#fbbf24' : '#818cf8'};">
        ${h.avg_surge_multiplier}x
      </td>
      <td style="font-weight:600;">$${h.avg_rider_fare}</td>
      <td>${h.ride_volume}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <div style="flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${h.demand_index}%;background:linear-gradient(90deg,var(--accent-cyan),var(--accent-rose));border-radius:3px;"></div>
          </div>
          <span style="font-size:0.75rem;color:var(--text-muted);">${h.demand_index}%</span>
        </div>
      </td>
      <td style="color:var(--accent-amber);">${h.floor_protection_pct}%</td>
      <td>${liveTag}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveAdminConfig() {
  const base_fare = parseFloat(document.getElementById('cfg_base_fare').value);
  const max_surge_cap = parseFloat(document.getElementById('cfg_max_surge').value);
  const min_driver_floor = parseFloat(document.getElementById('cfg_min_floor').value);
  const driver_split_pct = parseFloat(document.getElementById('cfg_driver_split').value) / 100.0;

  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_fare, max_surge_cap, min_driver_floor, driver_split_pct
      })
    });

    if (!res.ok) throw new Error("Failed to update config");
    const data = await res.json();
    alert("✅ Admin Fairness Policy Updated Live!\nNew Surge Cap: " + max_surge_cap + "x\nNew Driver Floor: $" + min_driver_floor.toFixed(2));
    fetchAdminMetrics();
    fetchPeakHoursAnalytics();
  } catch (err) {
    alert("Error updating policy: " + err.message);
  }
}

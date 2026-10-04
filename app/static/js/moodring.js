// ============================================================
//  FARE MOOD RING — FairFare NYC Novelty Feature
//  A real-time "market sentiment" widget that reflects the
//  current fare climate: demand pressure, surge intensity,
//  driver floor activity, and ML model confidence.
// ============================================================

const MOOD_RING_CONFIG = {
  updateIntervalMs: 8000,
  states: [
    {
      id: 'serene',
      label: 'CALM',
      emoji: '😌',
      desc: 'Market is relaxed. Fares are at baseline. Great time to ride cheaply.',
      gradient: 'linear-gradient(135deg, #06b6d4, #6366f1)',
      glow: '#6366f1',
      surgeThreshold: [1.0, 1.15],
      demandThreshold: [0, 20]
    },
    {
      id: 'steady',
      label: 'STEADY',
      emoji: '🙂',
      desc: 'Mild demand increase detected. Fares are slightly above baseline.',
      gradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
      glow: '#10b981',
      surgeThreshold: [1.15, 1.3],
      demandThreshold: [20, 45]
    },
    {
      id: 'warming',
      label: 'WARMING',
      emoji: '🌤️',
      desc: 'Demand is building. Moderate surge in effect. Prices rising.',
      gradient: 'linear-gradient(135deg, #f59e0b, #10b981)',
      glow: '#f59e0b',
      surgeThreshold: [1.3, 1.5],
      demandThreshold: [45, 65]
    },
    {
      id: 'hot',
      label: 'SURGE',
      emoji: '🔥',
      desc: 'High demand! Surge pricing active. Prices capped for rider protection.',
      gradient: 'linear-gradient(135deg, #f43f5e, #f59e0b)',
      glow: '#f43f5e',
      surgeThreshold: [1.5, 1.8],
      demandThreshold: [65, 88]
    },
    {
      id: 'peak',
      label: 'PEAK',
      emoji: '⚡',
      desc: 'Maximum surge cap reached. Platform fairness limits applied. All drivers on deck.',
      gradient: 'linear-gradient(135deg, #a855f7, #f43f5e)',
      glow: '#a855f7',
      surgeThreshold: [1.8, 999],
      demandThreshold: [88, 100]
    }
  ]
};

let _moodPanelOpen = false;
let _moodUpdateInterval = null;
let _lastMoodData = null;

// ── Compute mood from admin metrics ──────────────────────────
async function computeMarketMood() {
  try {
    const res = await fetch('/api/admin/metrics');
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data.system_stats;
    const policy = stats.active_fairness_policy;
    
    // Gather signals
    const surgeCap = policy.max_surge_cap;
    const surgePct = stats.surge_capped_pct;
    const floorPct = stats.min_floor_pct;
    const totalQuotes = stats.total_quotes_generated;

    // Synthesize a "current demand score" — average of recent surge signals
    // Since we don't have real-time demand, we infer from audit log stats
    const inferredSurge = 1.0 + (surgePct / 100) * (surgeCap - 1.0);
    const demandIndex = Math.min(100, (inferredSurge - 1.0) / 0.8 * 100);

    // Find matching mood state
    const mood = MOOD_RING_CONFIG.states.find(s =>
      inferredSurge >= s.surgeThreshold[0] && inferredSurge < s.surgeThreshold[1]
    ) || MOOD_RING_CONFIG.states[0];

    return {
      mood,
      inferredSurge: inferredSurge.toFixed(2),
      demandIndex: Math.round(demandIndex),
      surgePct: surgePct,
      floorPct: floorPct,
      totalQuotes,
      driverLoad: Math.min(100, Math.round(floorPct * 1.4 + Math.random() * 8))
    };
  } catch (e) {
    return null;
  }
}

// ── DOM rendering ─────────────────────────────────────────────
function initMoodRingWidget() {
  const widget = document.getElementById('mood-ring-widget');
  if (!widget) return;

  widget.innerHTML = `
    <div class="mood-ring-outer" onclick="toggleMoodPanel()" id="mood-ring-outer">
      <div class="mood-ring-glow" id="mood-ring-glow"></div>
      <div class="mood-ring-core" id="mood-ring-core">
        <span id="mood-ring-emoji">🎯</span>
        <span class="mood-ring-label" id="mood-ring-label">LOADING</span>
      </div>
    </div>
    <div class="mood-ring-panel" id="mood-ring-panel">
      <h4>🎯 Live Market Pulse</h4>
      <div class="mood-bar-row">
        <span class="mood-bar-label">Demand</span>
        <div class="mood-bar-track"><div class="mood-bar-fill" id="mb-demand" style="width:0%;background:linear-gradient(90deg,#06b6d4,#6366f1);"></div></div>
        <span class="mood-value" id="mv-demand">—</span>
      </div>
      <div class="mood-bar-row">
        <span class="mood-bar-label">Surge</span>
        <div class="mood-bar-track"><div class="mood-bar-fill" id="mb-surge" style="width:0%;background:linear-gradient(90deg,#f59e0b,#f43f5e);"></div></div>
        <span class="mood-value" id="mv-surge">—</span>
      </div>
      <div class="mood-bar-row">
        <span class="mood-bar-label">Driver Load</span>
        <div class="mood-bar-track"><div class="mood-bar-fill" id="mb-driver" style="width:0%;background:linear-gradient(90deg,#10b981,#06b6d4);"></div></div>
        <span class="mood-value" id="mv-driver">—</span>
      </div>
      <div class="mood-bar-row">
        <span class="mood-bar-label">Floor Active</span>
        <div class="mood-bar-track"><div class="mood-bar-fill" id="mb-floor" style="width:0%;background:linear-gradient(90deg,#f59e0b,#10b981);"></div></div>
        <span class="mood-value" id="mv-floor">—</span>
      </div>
      <div class="mood-status-text" id="mood-status-text">Analyzing market conditions...</div>
    </div>
  `;

  updateMoodRing();
  _moodUpdateInterval = setInterval(updateMoodRing, MOOD_RING_CONFIG.updateIntervalMs);
}

async function updateMoodRing() {
  const moodData = await computeMarketMood();
  if (!moodData) return;
  _lastMoodData = moodData;

  const { mood, inferredSurge, demandIndex, surgePct, floorPct, totalQuotes, driverLoad } = moodData;

  // Update ring visuals
  const core = document.getElementById('mood-ring-core');
  const glow = document.getElementById('mood-ring-glow');
  const emojiEl = document.getElementById('mood-ring-emoji');
  const labelEl = document.getElementById('mood-ring-label');

  if (core) { core.style.background = mood.gradient; }
  if (glow) { glow.style.background = mood.gradient; }
  if (emojiEl) { emojiEl.textContent = mood.emoji; }
  if (labelEl) { labelEl.textContent = mood.label; }

  // Update bars
  setMoodBar('demand', demandIndex, `${demandIndex}%`);
  setMoodBar('surge', Math.min(100, ((inferredSurge - 1.0) / 0.8) * 100), `${inferredSurge}x`);
  setMoodBar('driver', driverLoad, `${driverLoad}%`);
  setMoodBar('floor', Math.min(100, floorPct * 3), `${floorPct.toFixed(0)}%`);

  const statusEl = document.getElementById('mood-status-text');
  if (statusEl) {
    statusEl.innerHTML = `<strong style="color:#fff;">${mood.emoji} ${mood.id.charAt(0).toUpperCase() + mood.id.slice(1)} Market</strong><br>${mood.desc}<br><span style="margin-top:0.3rem;display:block;font-size:0.75rem;">${totalQuotes} quotes logged today</span>`;
  }
}

function setMoodBar(id, pct, label) {
  const bar = document.getElementById(`mb-${id}`);
  const val = document.getElementById(`mv-${id}`);
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (val) val.textContent = label;
}

function toggleMoodPanel() {
  _moodPanelOpen = !_moodPanelOpen;
  const panel = document.getElementById('mood-ring-panel');
  if (panel) panel.classList.toggle('open', _moodPanelOpen);
}

// Close mood panel when clicking outside
document.addEventListener('click', (e) => {
  const widget = document.getElementById('mood-ring-widget');
  if (widget && !widget.contains(e.target) && _moodPanelOpen) {
    _moodPanelOpen = false;
    const panel = document.getElementById('mood-ring-panel');
    if (panel) panel.classList.remove('open');
  }
});

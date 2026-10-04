// ============================================================
// DRIVER PORTAL — real-time notifications + earnings view
// ============================================================

let currentDriverActiveQuoteId = null;
let driverPollInterval = null;
let _sseSource = null;
let _toastTimers = {};

// ── Web Audio notification chime ──────────────────────────────
function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch (e) { /* audio not available */ }
}

// ── SSE connection to real-time notification stream ───────────
function startDriverNotificationStream() {
  if (_sseSource) return; // already connected

  _sseSource = new EventSource('/api/driver/notifications');

  _sseSource.onopen = () => {
    console.log('[Driver SSE] Notification stream connected ✅');
  };

  _sseSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'NEW_RIDE_REQUEST') {
        playNotificationChime();
        showRideRequestToast(msg);
        // Also refresh the dispatch queue panel
        checkPendingDriverTrips();
      }
    } catch (e) {
      console.warn('[Driver SSE] Could not parse message', e);
    }
  };

  _sseSource.onerror = () => {
    console.warn('[Driver SSE] Connection lost — retrying in 5s...');
    _sseSource.close();
    _sseSource = null;
    setTimeout(startDriverNotificationStream, 5000);
  };
}

// ── Animated toast notification ───────────────────────────────
function showRideRequestToast(trip) {
  const container = document.getElementById('driver-notification-container');
  if (!container) return;

  const toastId = `toast-${trip.quote_id}`;
  const timeoutSec = 25;

  const toast = document.createElement('div');
  toast.className = 'driver-toast';
  toast.id = toastId;
  toast.setAttribute('role', 'alert');

  const distText = trip.distance_km ? `${parseFloat(trip.distance_km).toFixed(2)} km` : '—';

  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-pulse"></div>
      <span class="toast-title">⚡ New Ride Request!</span>
      <button class="toast-close" onclick="dismissToast('${toastId}')" aria-label="Dismiss">✕</button>
    </div>
    <div class="toast-fare">$${parseFloat(trip.driver_payout || 0).toFixed(2)} <span style="font-size:0.9rem;color:var(--text-muted);">payout</span></div>
    <div class="toast-meta">
      📍 Pickup: <strong>${trip.pickup_location || '—'}</strong><br>
      🏁 Dropoff: <strong>${trip.dropoff_location || '—'}</strong><br>
      📏 Distance: <strong>${distText}</strong> &nbsp;|&nbsp; 🧾 Rider pays: <strong>$${parseFloat(trip.rider_fare || 0).toFixed(2)}</strong>
    </div>
    <div class="toast-actions">
      <button class="btn btn-emerald" style="flex:1;padding:0.6rem;" onclick="quickAcceptFromToast('${trip.quote_id}','${toastId}')">✅ Accept</button>
      <button class="btn btn-outline" style="flex:1;padding:0.6rem;" onclick="quickDeclineFromToast('${trip.quote_id}','${toastId}')">❌ Decline</button>
    </div>
    <div class="toast-countdown" id="${toastId}-countdown">Auto-dismissing in ${timeoutSec}s…</div>
  `;

  container.appendChild(toast);

  // Countdown timer
  let remaining = timeoutSec;
  const interval = setInterval(() => {
    remaining--;
    const el = document.getElementById(`${toastId}-countdown`);
    if (el) el.textContent = `Auto-dismissing in ${remaining}s…`;
    if (remaining <= 0) {
      clearInterval(interval);
      dismissToast(toastId);
    }
  }, 1000);

  _toastTimers[toastId] = interval;
}

function dismissToast(toastId) {
  clearInterval(_toastTimers[toastId]);
  delete _toastTimers[toastId];
  const el = document.getElementById(toastId);
  if (!el) return;
  el.classList.add('toast-exit');
  setTimeout(() => el.remove(), 400);
}

async function quickAcceptFromToast(quoteId, toastId) {
  dismissToast(toastId);
  // Switch to driver tab so the action is visible
  if (typeof switchTab === 'function') switchTab('driver');
  const trip = await fetchTripForQuote(quoteId);
  await respondDriverTrip(quoteId, 'ACCEPT', trip);
}

async function quickDeclineFromToast(quoteId, toastId) {
  dismissToast(toastId);
  await respondDriverTrip(quoteId, 'DECLINE', null);
  await checkPendingDriverTrips();
}

async function fetchTripForQuote(quoteId) {
  try {
    const res = await fetch('/api/driver/pending-trips');
    if (!res.ok) return null;
    const data = await res.json();
    return data.pending_trips.find(t => t.quote_id === quoteId) || null;
  } catch { return null; }
}

// ── Main load ─────────────────────────────────────────────────
async function loadDriverPortal() {
  try {
    const res = await fetch('/api/driver/earnings');
    if (!res.ok) throw new Error("Failed to load driver earnings");
    const data = await res.json();
    renderDriverPortal(data);
    await checkPendingDriverTrips();
    startDriverNotificationStream();
  } catch (err) {
    console.error("Error loading driver portal:", err);
  }
}

async function checkPendingDriverTrips() {
  try {
    const res = await fetch('/api/driver/pending-trips');
    if (!res.ok) return;
    const data = await res.json();
    
    const queueContainer = document.getElementById('driver_dispatch_queue');
    const cardsContainer = document.getElementById('driver_pending_cards_container');
    cardsContainer.replaceChildren();

    if (data.pending_trips.length === 0) {
      queueContainer.style.display = 'none';
      return;
    }

    queueContainer.style.display = 'block';

    data.pending_trips.forEach(trip => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.background = 'rgba(15, 23, 42, 0.9)';
      card.style.marginBottom = '0.75rem';
      card.style.padding = '1rem';

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.marginBottom = '0.5rem';

      const quoteSpan = document.createElement('span');
      quoteSpan.className = 'badge badge-indigo';
      quoteSpan.textContent = trip.quote_id;

      const payoutSpan = document.createElement('span');
      payoutSpan.style.fontFamily = 'var(--font-heading)';
      payoutSpan.style.fontSize = '1.3rem';
      payoutSpan.style.fontWeight = '800';
      payoutSpan.style.color = 'var(--accent-emerald)';
      payoutSpan.textContent = `Driver Payout: $${trip.driver_payout.toFixed(2)}`;

      headerDiv.appendChild(quoteSpan);
      headerDiv.appendChild(payoutSpan);

      const detailsDiv = document.createElement('div');
      detailsDiv.style.fontSize = '0.85rem';
      detailsDiv.style.color = 'var(--text-main)';
      detailsDiv.style.marginBottom = '1rem';

      const riderP = document.createElement('p');
      riderP.textContent = `👤 Rider: ${trip.rider_name} • Distance: ${trip.distance_km.toFixed(2)} km`;
      
      const routeP = document.createElement('p');
      routeP.textContent = `📍 Pickup: ${trip.pickup_lat.toFixed(4)}, ${trip.pickup_lon.toFixed(4)} ➔ Dropoff: ${trip.dropoff_lat.toFixed(4)}, ${trip.dropoff_lon.toFixed(4)}`;
      
      const floorP = document.createElement('p');
      floorP.style.fontSize = '0.8rem';
      floorP.style.color = trip.is_floor_applied ? 'var(--accent-amber)' : 'var(--accent-emerald)';
      floorP.textContent = trip.is_floor_applied ? 
        `🛡️ Min-Floor Applied (Platform Subsidized +$${trip.floor_subsidy.toFixed(2)})` : 
        `✅ Standard Split Guarantee`;

      detailsDiv.appendChild(riderP);
      detailsDiv.appendChild(routeP);
      detailsDiv.appendChild(floorP);

      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '0.75rem';

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn btn-emerald';
      acceptBtn.style.flex = '1';
      acceptBtn.textContent = '✅ Accept Booking';
      acceptBtn.onclick = () => respondDriverTrip(trip.quote_id, 'ACCEPT', trip);

      const declineBtn = document.createElement('button');
      declineBtn.className = 'btn btn-outline';
      declineBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      declineBtn.style.color = '#f87171';
      declineBtn.style.flex = '1';
      declineBtn.textContent = '❌ Decline Booking';
      declineBtn.onclick = () => respondDriverTrip(trip.quote_id, 'DECLINE', trip);

      btnGroup.appendChild(acceptBtn);
      btnGroup.appendChild(declineBtn);

      card.appendChild(headerDiv);
      card.appendChild(detailsDiv);
      card.appendChild(btnGroup);

      cardsContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Error checking pending driver trips:", err);
  }
}

async function respondDriverTrip(quoteId, action, tripData) {
  try {
    const res = await fetch('/api/driver/respond-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: quoteId,
        action: action,
        driver_id: "drv-4829",
        driver_name: "Driver Marco"
      })
    });

    if (!res.ok) throw new Error("Failed to send response");
    const data = await res.json();

    if (action === 'ACCEPT') {
      currentDriverActiveQuoteId = quoteId;
      document.getElementById('driver_dispatch_queue').style.display = 'none';
      document.getElementById('driver_active_ride_card').style.display = 'block';
      document.getElementById('driver_active_quote_id').textContent = quoteId;
      document.getElementById('driver_active_status_badge').textContent = 'ACCEPTED (EN-ROUTE TO PICKUP)';
      if (tripData) {
        document.getElementById('driver_active_payout').textContent = `$${tripData.driver_payout.toFixed(2)}`;
        document.getElementById('driver_active_route_info').textContent = `${tripData.distance_km.toFixed(2)} km • Rider: ${tripData.rider_name || 'Alex Rider'}`;
      }
    } else {
      document.getElementById('driver_dispatch_queue').style.display = 'none';
    }

    await loadDriverPortal();
  } catch (err) {
    alert("Error responding to ride request: " + err.message);
  }
}

async function setDriverTripProgress(newStatus) {
  if (!currentDriverActiveQuoteId) return;

  try {
    const res = await fetch('/api/driver/update-trip-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: currentDriverActiveQuoteId,
        new_status: newStatus
      })
    });

    if (!res.ok) throw new Error("Failed to update trip status");

    if (newStatus === 'IN_TRANSIT') {
      document.getElementById('driver_active_status_badge').textContent = 'IN TRANSIT (TO DESTINATION)';
    } else if (newStatus === 'COMPLETED') {
      document.getElementById('driver_active_ride_card').style.display = 'none';
      currentDriverActiveQuoteId = null;
      alert("🎉 Ride Completed & Payout Collected!");
      await loadDriverPortal();
    }
  } catch (err) {
    alert("Error updating trip status: " + err.message);
  }
}

function renderDriverPortal(data) {
  document.getElementById('driver_today_earnings').textContent = `$${data.today_earnings.toFixed(2)}`;
  document.getElementById('driver_total_trips').textContent = data.total_trips_completed;
  document.getElementById('driver_subsidies_received').textContent = `$${data.total_floor_subsidies_received.toFixed(2)}`;
  document.getElementById('driver_min_floor').textContent = `$${data.guaranteed_minimum_floor.toFixed(2)}`;

  const tbody = document.getElementById('driver_trips_table_body');
  tbody.replaceChildren();

  if (data.trips.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.textAlign = 'center';
    td.style.color = 'var(--text-muted)';
    td.style.padding = '1.5rem';
    td.textContent = 'No trips recorded today yet. Calculate & book a trip from the Rider view!';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  data.trips.forEach(trip => {
    const tr = document.createElement('tr');

    const tdQuote = document.createElement('td');
    const strongQuote = document.createElement('strong');
    strongQuote.textContent = trip.quote_id;
    tdQuote.appendChild(strongQuote);

    const tdTime = document.createElement('td');
    tdTime.textContent = new Date(trip.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const tdDist = document.createElement('td');
    tdDist.textContent = `${trip.distance_km.toFixed(2)} km`;

    const tdRider = document.createElement('td');
    tdRider.textContent = `$${trip.rider_fare.toFixed(2)}`;

    const tdDriver = document.createElement('td');
    tdDriver.style.fontWeight = '700';
    tdDriver.style.color = 'var(--accent-emerald)';
    tdDriver.textContent = `$${trip.driver_payout.toFixed(2)}`;

    const tdGuarantee = document.createElement('td');
    const badgeSpan = document.createElement('span');
    badgeSpan.className = trip.is_floor_applied ? 'badge badge-amber' : 'badge badge-emerald';
    badgeSpan.textContent = trip.is_floor_applied ? `Floor Protected (+$${trip.floor_subsidy.toFixed(2)})` : 'Standard Split';
    tdGuarantee.appendChild(badgeSpan);

    tr.appendChild(tdQuote);
    tr.appendChild(tdTime);
    tr.appendChild(tdDist);
    tr.appendChild(tdRider);
    tr.appendChild(tdDriver);
    tr.appendChild(tdGuarantee);

    tbody.appendChild(tr);
  });
}

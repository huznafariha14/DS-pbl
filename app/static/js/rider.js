// Rider Web App Module
let currentQuote = null;
let countdownInterval = null;

async function calculateFareQuote() {
  const pickup_lat = parseFloat(document.getElementById('pickup_lat').value);
  const pickup_lon = parseFloat(document.getElementById('pickup_lon').value);
  const dropoff_lat = parseFloat(document.getElementById('dropoff_lat').value);
  const dropoff_lon = parseFloat(document.getElementById('dropoff_lon').value);
  const passenger_count = parseInt(document.getElementById('passenger_count').value);
  const demand_factor = parseFloat(document.getElementById('demand_factor').value);
  const pickup_datetime = document.getElementById('pickup_datetime').value || new Date().toISOString().slice(0, 19);

  const payload = {
    pickup_latitude: pickup_lat,
    pickup_longitude: pickup_lon,
    dropoff_latitude: dropoff_lat,
    dropoff_longitude: dropoff_lon,
    pickup_datetime: pickup_datetime,
    passenger_count: passenger_count,
    demand_factor: demand_factor
  };

  try {
    const res = await fetch('/api/calculate-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Failed to calculate fare quote");
    const data = await res.json();
    currentQuote = data;
    renderQuoteResults(data);
  } catch (err) {
    alert("Error calculating price: " + err.message);
  }
}

function renderQuoteResults(quote) {
  const r = quote.rider_fare_breakdown;
  const e = quote.explainability;
  const d = quote.driver_payout_breakdown;

  // Display Total Fare & Quote ID
  document.getElementById('display_total_fare').textContent = `$${r.total_rider_fare.toFixed(2)}`;
  document.getElementById('display_quote_id').textContent = quote.quote_id;

  // Itemized Breakdown
  document.getElementById('item_base').textContent = `$${r.base_fare.toFixed(2)}`;
  document.getElementById('item_distance').textContent = `$${r.distance_fee.toFixed(2)} (${quote.trip_details.distance_km} km)`;
  document.getElementById('item_time').textContent = `$${r.time_fee.toFixed(2)} (${quote.trip_details.estimated_minutes} min)`;
  
  const surgeElem = document.getElementById('item_surge');
  surgeElem.textContent = `${e.surge_demand_multiplier}x (+$${r.surge_amount.toFixed(2)})`;
  
  if (e.is_surge_capped) {
    document.getElementById('surge_capped_badge').style.display = 'inline-block';
    document.getElementById('surge_savings_note').textContent = `🛡️ Hard surge cap enforced! You saved $${e.capped_savings_for_rider.toFixed(2)} vs unadjusted price (${e.surge_uncapped_requested}x).`;
    document.getElementById('surge_savings_note').style.display = 'block';
  } else {
    document.getElementById('surge_capped_badge').style.display = 'none';
    document.getElementById('surge_savings_note').style.display = 'none';
  }

  document.getElementById('item_tax').textContent = `$${r.taxes_and_fees.toFixed(2)}`;

  // Explainability View ("Why this price?")
  document.getElementById('explain_summary').textContent = e.summary;
  document.getElementById('explain_ml_pred').textContent = `$${quote.ml_model.raw_fare_prediction.toFixed(2)} (CI: $${quote.ml_model.confidence_interval_95[0]} - $${quote.ml_model.confidence_interval_95[1]})`;
  document.getElementById('explain_driver_floor').textContent = d.is_floor_subsidy_applied ? 
    `Guaranteed min floor ($${d.minimum_floor.toFixed(2)}) applied! Platform subsidized +$${d.floor_subsidy_amount.toFixed(2)} for driver fairness.` :
    `Driver receives 80% split ($${d.final_driver_payout.toFixed(2)}) which meets/exceeds min floor guarantee.`;

  // Show Quote Panel & Start 15-minute Timer
  document.getElementById('quote_results_panel').style.display = 'block';
  startQuoteTimer(quote.expires_at);
}

function startQuoteTimer(expiresAtSeconds) {
  if (countdownInterval) clearInterval(countdownInterval);

  function updateTimer() {
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAtSeconds - now;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      document.getElementById('quote_timer').textContent = "EXPIRED";
      document.getElementById('book_btn').disabled = true;
    } else {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      document.getElementById('quote_timer').textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      document.getElementById('book_btn').disabled = false;
    }
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

let activeBookingPollInterval = null;

async function bookTrip() {
  if (!currentQuote) return;

  try {
    const res = await fetch('/api/book-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: currentQuote.quote_id,
        rider_id: "rider-101",
        rider_name: "Alex Rider"
      })
    });

    if (!res.ok) throw new Error("Booking failed");
    const data = await res.json();

    document.getElementById('quote_results_panel').style.display = 'none';
    document.getElementById('active_booking_card').style.display = 'block';

    // Start live tracking loop
    startActiveBookingPolling(currentQuote.quote_id);
  } catch (err) {
    alert("Error booking trip: " + err.message);
  }
}

function startActiveBookingPolling(quoteId) {
  if (activeBookingPollInterval) clearInterval(activeBookingPollInterval);
  
  async function fetchTelemetry() {
    try {
      const res = await fetch(`/api/trip-status/${quoteId}`);
      if (!res.ok) return;
      const data = await res.json();
      renderActiveBookingDetails(data);
    } catch (e) {
      console.error("Telemetry fetch error:", e);
    }
  }

  fetchTelemetry();
  activeBookingPollInterval = setInterval(fetchTelemetry, 1500);
}

function renderActiveBookingDetails(data) {
  document.getElementById('active_booking_quote_id').textContent = data.quote_id;
  document.getElementById('active_booking_status_badge').textContent = data.status;
  document.getElementById('active_booking_phase').textContent = data.phase_text;
  
  if (data.driver) {
    document.getElementById('active_driver_name').textContent = data.driver.name;
    document.getElementById('active_driver_vehicle').textContent = data.driver.vehicle;
    document.getElementById('active_driver_rating').textContent = `${data.driver.rating} • NYC TLC Licensed`;
  }
  
  if (data.fare) {
    document.getElementById('active_rider_fare').textContent = `$${data.fare.rider_fare.toFixed(2)}`;
  }

  // Update status badge style
  const badge = document.getElementById('active_booking_status_badge');
  badge.className = 'badge';
  if (data.status === 'PENDING_ACCEPTANCE') badge.classList.add('badge-amber');
  else if (data.status === 'ACCEPTED' || data.status === 'IN_TRANSIT') badge.classList.add('badge-emerald');
  else if (data.status === 'COMPLETED') badge.classList.add('badge-indigo');
  else badge.classList.add('badge-rose');

  // Update Live Driver Marker on Map
  if (data.telemetry && data.telemetry.driver_lat && data.telemetry.driver_lon) {
    updateDriverMarkerOnMap(data.telemetry.driver_lat, data.telemetry.driver_lon, data.phase_text);
  }

  // Stop polling if completed or cancelled/declined
  if (['COMPLETED', 'DECLINED', 'CANCELLED'].includes(data.status)) {
    if (activeBookingPollInterval) clearInterval(activeBookingPollInterval);
  }
}

async function cancelActiveTrip() {
  if (!currentQuote) return;
  try {
    const res = await fetch('/api/cancel-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: currentQuote.quote_id,
        distance_driven_km: 0.2,
        wait_minutes: 1.0
      })
    });
    if (!res.ok) throw new Error("Cancellation failed");
    if (activeBookingPollInterval) clearInterval(activeBookingPollInterval);
    removeDriverMarkerOnMap();
    document.getElementById('active_booking_card').style.display = 'none';
    alert("Trip Cancelled.");
  } catch (e) {
    alert("Error cancelling trip: " + e.message);
  }
}


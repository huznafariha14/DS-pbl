// App Coordinator & State Manager
document.addEventListener("DOMContentLoaded", function () {
  // Initialize Leaflet Map
  initNYCMap();

  // Preset location selector change handler
  document.getElementById('preset_pickup').addEventListener('change', function(e) {
    const val = e.target.value;
    if (LANDMARKS[val]) {
      setPickupLocation(LANDMARKS[val].lat, LANDMARKS[val].lon);
    }
  });

  document.getElementById('preset_dropoff').addEventListener('change', function(e) {
    const val = e.target.value;
    if (LANDMARKS[val]) {
      setDropoffLocation(LANDMARKS[val].lat, LANDMARKS[val].lon);
    }
  });

  // Default pickup datetime input to current local time
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('pickup_datetime').value = now.toISOString().slice(0, 16);

  // Trigger initial calculation
  calculateFareQuote();
});

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  document.getElementById(`tab_btn_${tabId}`).classList.add('active');
  document.getElementById(`view_${tabId}`).classList.add('active');

  if (tabId === 'rider') {
    if (nycMap) setTimeout(() => nycMap.invalidateSize(), 200);
  } else if (tabId === 'driver') {
    loadDriverPortal();
  } else if (tabId === 'admin') {
    loadAdminDashboard();
  }
}

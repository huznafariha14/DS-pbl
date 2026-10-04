// Leaflet.js Interactive NYC Map Controller
let nycMap = null;
let pickupMarker = null;
let dropoffMarker = null;
let routeLine = null;

// Default Locations (NYC Landmarks)
const LANDMARKS = {
  jfk: { lat: 40.6413, lon: -73.7781, name: "JFK International Airport" },
  lga: { lat: 40.7769, lon: -73.8740, name: "LaGuardia Airport" },
  times_square: { lat: 40.7589, lon: -73.9851, name: "Times Square, Manhattan" },
  central_park: { lat: 40.7812, lon: -73.9665, name: "Central Park" },
  wall_street: { lat: 40.7074, lon: -74.0113, name: "Wall Street, Financial District" },
  brooklyn_bridge: { lat: 40.7061, lon: -73.9969, name: "Brooklyn Bridge Park" }
};

function initNYCMap() {
  if (nycMap !== null) return;

  // Initialize Map centered on NYC
  nycMap = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([40.730610, -73.935242], 11);

  // Dark CartoDB Tile Layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(nycMap);

  // Set default initial markers (Times Square -> JFK)
  setPickupLocation(LANDMARKS.times_square.lat, LANDMARKS.times_square.lon);
  setDropoffLocation(LANDMARKS.jfk.lat, LANDMARKS.jfk.lon);

  // Click on map toggles pickup / dropoff selection
  let selectionState = 'pickup';
  nycMap.on('click', function(e) {
    if (selectionState === 'pickup') {
      setPickupLocation(e.latlng.lat, e.latlng.lng);
      selectionState = 'dropoff';
    } else {
      setDropoffLocation(e.latlng.lat, e.latlng.lng);
      selectionState = 'pickup';
    }
  });
}

function setPickupLocation(lat, lon) {
  lat = parseFloat(lat.toFixed(4));
  lon = parseFloat(lon.toFixed(4));

  document.getElementById('pickup_lat').value = lat;
  document.getElementById('pickup_lon').value = lon;

  if (pickupMarker) nycMap.removeLayer(pickupMarker);
  
  const greenIcon = L.divIcon({
    className: 'custom-div-icon',
    html: "<div style='background-color:#10b981;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #10b981;'></div>",
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  pickupMarker = L.marker([lat, lon], { icon: greenIcon }).addTo(nycMap)
    .bindPopup("<b>Pickup Location</b><br>" + lat + ", " + lon);

  updateMapRoute();
}

function setDropoffLocation(lat, lon) {
  lat = parseFloat(lat.toFixed(4));
  lon = parseFloat(lon.toFixed(4));

  document.getElementById('dropoff_lat').value = lat;
  document.getElementById('dropoff_lon').value = lon;

  if (dropoffMarker) nycMap.removeLayer(dropoffMarker);

  const amberIcon = L.divIcon({
    className: 'custom-div-icon',
    html: "<div style='background-color:#f59e0b;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #f59e0b;'></div>",
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  dropoffMarker = L.marker([lat, lon], { icon: amberIcon }).addTo(nycMap)
    .bindPopup("<b>Dropoff Location</b><br>" + lat + ", " + lon);

  updateMapRoute();
}

function updateMapRoute() {
  if (!pickupMarker || !dropoffMarker) return;

  const pLat = pickupMarker.getLatLng();
  const dLat = dropoffMarker.getLatLng();

  if (routeLine) nycMap.removeLayer(routeLine);

  routeLine = L.polyline([pLat, dLat], {
    color: '#06b6d4',
    weight: 4,
    opacity: 0.8,
    dashArray: '8, 8'
  }).addTo(nycMap);

  nycMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
}

let driverMarker = null;

function updateDriverMarkerOnMap(lat, lon, popupText) {
  if (!nycMap) return;
  const taxiIcon = L.divIcon({
    className: 'custom-taxi-icon',
    html: "<div style='background-color:#eab308;width:26px;height:26px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 14px #eab308;display:flex;align-items:center;justify-content:center;font-size:14px;'>🚕</div>",
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  if (driverMarker) {
    driverMarker.setLatLng([lat, lon]);
    if (popupText) driverMarker.setPopupContent(`<b>Driver Telemetry</b><br>${popupText}`);
  } else {
    driverMarker = L.marker([lat, lon], { icon: taxiIcon }).addTo(nycMap)
      .bindPopup(`<b>Driver Telemetry</b><br>${popupText || 'En-route'}`);
  }
}

function removeDriverMarkerOnMap() {
  if (driverMarker && nycMap) {
    nycMap.removeLayer(driverMarker);
    driverMarker = null;
  }
}


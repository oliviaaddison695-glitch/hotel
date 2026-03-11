const N8N_WEBHOOK_URL = "https://oliviaaddison695.app.n8n.cloud/form-test/6d2bd2be-be7e-4ea2-8b35-98c02625ed01";
const DRIVE_FOLDER_URL = "https://drive.google.com/";

const hotelForm = document.getElementById("hotelForm");
const hotelNameInput = document.getElementById("hotelName");
const statusEl = document.getElementById("status");
const resultCard = document.getElementById("resultCard");

const nameEl = document.getElementById("name");
const addressEl = document.getElementById("address");
const phoneEl = document.getElementById("phone");
const ratingEl = document.getElementById("rating");
const websiteLink = document.getElementById("websiteLink");
const tripLink = document.getElementById("tripLink");
const bookingLink = document.getElementById("bookingLink");

const placesList = document.getElementById("placesList");
const policeList = document.getElementById("policeList");
const resultsHeading = document.getElementById("resultsHeading");
const policeHeading = document.getElementById("policeHeading");

const triggerWorkflowBtn = document.getElementById("triggerWorkflowBtn");
const driveFolderBtn = document.getElementById("driveFolderBtn");
const workflowStatus = document.getElementById("workflowStatus");

let nearbyMap;
let policeMap;
let nearbyInfoWindow;
let policeInfoWindow;
let nearbyMarkers = [];
let policeMarkers = [];
let googleMapsKey;

function categoryClass(categoryLabel) {
  if (categoryLabel === "Restaurant") return "marker-restaurant";
  if (categoryLabel === "Clothing store") return "marker-clothing";
  return "marker-store";
}

async function apiFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (error) {
    throw new Error(`Fetch failed: cannot reach server (${error.message}).`);
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload?.error || payload?.raw || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload;
}

async function loadClientConfig() {
  const config = await apiFetch("/api/config");
  return config;
}

async function loadGoogleMaps() {
  if (window.google?.maps?.marker) return;

  if (!googleMapsKey) {
    const config = await loadClientConfig();
    googleMapsKey = config.mapsApiKey;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
    document.head.appendChild(script);
  });
}

function buildSearchLinks(hotelName, address) {
  const query = encodeURIComponent(`${hotelName} ${address}`);
  tripLink.href = `https://www.tripadvisor.com/Search?q=${query}`;
  bookingLink.href = `https://www.booking.com/searchresults.html?ss=${query}`;
}

function clearMarkerGroup(group) {
  group.forEach((m) => {
    m.map = null;
  });
  group.length = 0;
}

function createLabelMarker(map, group, position, text, cssClass, title, onClick, zIndex = 1) {
  const markerContent = document.createElement("div");
  markerContent.className = `marker-label ${cssClass}`;
  markerContent.textContent = text;

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map,
    position,
    content: markerContent,
    title,
    gmpClickable: true,
    zIndex,
    collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
  });

  marker.addListener("click", onClick);
  group.push(marker);
  return marker;
}

function highlightList(listSelector, id) {
  document.querySelectorAll(listSelector).forEach((item) => {
    item.classList.toggle("active", item.dataset.placeId === id);
  });
}

function renderHotelInfo(hotel) {
  nameEl.textContent = hotel.name || "N/A";
  addressEl.textContent = hotel.address || "Address unavailable";
  phoneEl.textContent = hotel.phone || "Phone unavailable";
  ratingEl.textContent = hotel.rating ? `${hotel.rating} / 5` : "Not available";

  websiteLink.href = hotel.website || `https://www.google.com/search?q=${encodeURIComponent(hotel.name || "hotel")}`;
  buildSearchLinks(hotel.name || "hotel", hotel.address || "");
}

function renderNearbySection(hotel, places) {
  nearbyMap = nearbyMap || new google.maps.Map(document.getElementById("nearbyMap"), {
    center: hotel.location,
    zoom: 17,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  nearbyInfoWindow = nearbyInfoWindow || new google.maps.InfoWindow();
  nearbyMap.setCenter(hotel.location);
  clearMarkerGroup(nearbyMarkers);

  const bounds = new google.maps.LatLngBounds();
  bounds.extend(hotel.location);

  createLabelMarker(
    nearbyMap,
    nearbyMarkers,
    hotel.location,
    "Hotel",
    "marker-hotel",
    hotel.name,
    () => {
      nearbyInfoWindow.setContent(`<strong>${hotel.name}</strong><br>${hotel.address || "Address unavailable"}`);
      nearbyInfoWindow.open({ map: nearbyMap, position: hotel.location });
    },
    2000
  );

  const markerById = new Map();

  places.forEach((place) => {
    const position = place.location;
    bounds.extend(position);

    const marker = createLabelMarker(
      nearbyMap,
      nearbyMarkers,
      position,
      place.categoryLabel,
      categoryClass(place.categoryLabel),
      place.name,
      () => {
        highlightList("#placesList li", place.placeId);
        nearbyInfoWindow.setContent(`<strong>${place.name}</strong><br>${place.address || "Address unavailable"}<br><em>${place.categoryLabel}</em>`);
        nearbyInfoWindow.open({ map: nearbyMap, anchor: marker });
      }
    );

    markerById.set(place.placeId, marker);
  });

  if (places.length) {
    nearbyMap.fitBounds(bounds, 45);
    const z = nearbyMap.getZoom();
    if (z > 18) nearbyMap.setZoom(18);
  }

  resultsHeading.textContent = `Places (${places.length})`;
  placesList.innerHTML = "";

  places.forEach((place) => {
    const li = document.createElement("li");
    li.dataset.placeId = place.placeId;
    li.innerHTML = `
      <strong>${place.name}</strong><br>
      <small>${place.categoryLabel}</small><br>
      <small>${place.address || "Address unavailable"}</small><br>
      <small>${Math.round(place.distanceMeters)} m</small>
    `;

    li.addEventListener("click", () => {
      highlightList("#placesList li", place.placeId);
      const marker = markerById.get(place.placeId);
      if (!marker) return;
      nearbyMap.panTo(marker.position);
      nearbyInfoWindow.setContent(`<strong>${place.name}</strong><br>${place.address || "Address unavailable"}<br><em>${place.categoryLabel}</em>`);
      nearbyInfoWindow.open({ map: nearbyMap, anchor: marker });
    });

    placesList.appendChild(li);
  });
}

function renderPoliceSection(hotel, stations) {
  policeMap = policeMap || new google.maps.Map(document.getElementById("policeMap"), {
    center: hotel.location,
    zoom: 14,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  policeInfoWindow = policeInfoWindow || new google.maps.InfoWindow();
  clearMarkerGroup(policeMarkers);

  const bounds = new google.maps.LatLngBounds();
  bounds.extend(hotel.location);

  createLabelMarker(
    policeMap,
    policeMarkers,
    hotel.location,
    "Hotel",
    "marker-hotel",
    hotel.name,
    () => {
      policeInfoWindow.setContent(`<strong>${hotel.name}</strong><br>${hotel.address || "Address unavailable"}`);
      policeInfoWindow.open({ map: policeMap, position: hotel.location });
    },
    2000
  );

  const markerById = new Map();

  stations.forEach((station) => {
    bounds.extend(station.location);

    const marker = createLabelMarker(
      policeMap,
      policeMarkers,
      station.location,
      "Police",
      "marker-police",
      station.name,
      () => {
        highlightList("#policeList li", station.placeId);
        policeInfoWindow.setContent(`<strong>${station.name}</strong><br>${station.address || "Address unavailable"}`);
        policeInfoWindow.open({ map: policeMap, anchor: marker });
      }
    );

    markerById.set(station.placeId, marker);
  });

  if (stations.length) policeMap.fitBounds(bounds, 80);

  policeHeading.textContent = `Police stations (${stations.length})`;
  policeList.innerHTML = "";

  stations.forEach((station) => {
    const li = document.createElement("li");
    li.dataset.placeId = station.placeId;
    li.innerHTML = `
      <strong>${station.name}</strong><br>
      <small>${station.address || "Address unavailable"}</small><br>
      <small>Direct: ${Math.round(station.distanceMeters)} m</small><br>
      <small>Driving: ${station.drivingDistanceText || "n/a"} · ${station.drivingDurationText || "n/a"}</small>
    `;

    li.addEventListener("click", () => {
      highlightList("#policeList li", station.placeId);
      const marker = markerById.get(station.placeId);
      if (!marker) return;
      policeMap.panTo(marker.position);
      policeInfoWindow.setContent(`<strong>${station.name}</strong><br>${station.address || "Address unavailable"}`);
      policeInfoWindow.open({ map: policeMap, anchor: marker });
    });

    policeList.appendChild(li);
  });
}

hotelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = hotelNameInput.value.trim();

  statusEl.textContent = "Resolving hotel and loading map data...";

  try {
    await loadGoogleMaps();
    const data = await apiFetch("/api/hotel-nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    renderHotelInfo(data.hotel);
    renderNearbySection(data.hotel, data.nearbyPlaces || []);
    renderPoliceSection(data.hotel, data.policeStations || []);

    resultCard.hidden = false;
    statusEl.textContent = "Loaded hotel, nearby stores/restaurants (street-level), and closest police stations.";
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

triggerWorkflowBtn.addEventListener("click", async () => {
  workflowStatus.textContent = "Triggering workflow...";

  try {
    const hotel = nameEl.textContent !== "-" ? nameEl.textContent : "Unknown hotel";
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotel, source: "hotel-info-explorer" })
    });

    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    workflowStatus.textContent = "Workflow triggered successfully.";
  } catch (error) {
    workflowStatus.textContent = `Could not trigger workflow: ${error.message}`;
  }
});

driveFolderBtn.href = DRIVE_FOLDER_URL;

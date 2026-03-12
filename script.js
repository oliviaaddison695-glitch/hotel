const N8N_WEBHOOK_URL = "https://oliviaaddison695.app.n8n.cloud/form-test/6d2bd2be-be7e-4ea2-8b35-98c02625ed01";
const DRIVE_FOLDER_URL = "https://drive.google.com/";
const FALLBACK_BROWSER_MAPS_KEY = "AIzaSyCPYoWbh0n0jPYkIQmN5NuEn0CFMtoeYMs";

function readBrowserKeyOverride() {
  const fromWindow = window.HOTEL_MAPS_BROWSER_API_KEY;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("mapsKey");

  if (fromQuery && window.localStorage) {
    window.localStorage.setItem("HOTEL_MAPS_BROWSER_API_KEY", fromQuery);
  }

  const fromStorage = window.localStorage?.getItem("HOTEL_MAPS_BROWSER_API_KEY");
  return fromWindow || fromQuery || fromStorage || null;
}

const hotelForm = document.getElementById("hotelForm");
const hotelNameInput = document.getElementById("hotelName");
const searchBtn = hotelForm?.querySelector("button[type=\"submit\"]");
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
let searchInProgress = false;

function categoryClass(categoryLabel) {
  if (categoryLabel === "Restaurant") return "marker-restaurant";
  if (categoryLabel === "Clothing store") return "marker-clothing";
  if (categoryLabel === "Police") return "marker-police";
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
  const runningOnGithubPages = window.location.hostname.endsWith("github.io");
  if (runningOnGithubPages) {
    return { mapsApiKey: readBrowserKeyOverride() || FALLBACK_BROWSER_MAPS_KEY, source: "fallback" };
  }

  try {
    const config = await apiFetch("/api/config");
    return { ...config, source: "server" };
  } catch {
    return { mapsApiKey: readBrowserKeyOverride() || FALLBACK_BROWSER_MAPS_KEY, source: "fallback" };
  }
}

async function loadGoogleMaps() {
  if (window.google?.maps?.marker) return;

  const config = await loadClientConfig();
  const keyCandidates = [readBrowserKeyOverride(), config.mapsApiKey, FALLBACK_BROWSER_MAPS_KEY]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  let lastError = new Error("No Google Maps key available.");

  for (const candidateKey of keyCandidates) {
    try {
      await new Promise((resolve, reject) => {
        const existingScript = document.getElementById("gmaps-script");
        if (existingScript) existingScript.remove();

        let settled = false;
        const fail = (message) => {
          if (settled) return;
          settled = true;
          reject(new Error(message));
        };

        window.gm_authFailure = () => {
          fail("Google Maps key was rejected. Check API key referrer restrictions, enabled APIs, and billing.");
        };

        const script = document.createElement("script");
        script.id = "gmaps-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${candidateKey}&libraries=marker,places,geometry&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          setTimeout(() => {
            if (window.google?.maps?.importLibrary) {
              if (!settled) {
                settled = true;
                resolve();
              }
            } else {
              fail("Google Maps JavaScript API loaded incompletely. Verify key + API enablement + billing.");
            }
          }, 150);
        };
        script.onerror = () => fail("Failed to load Google Maps JavaScript API. Verify browser API key + Maps JavaScript API + billing.");
        document.head.appendChild(script);
      });

      googleMapsKey = candidateKey;
      return;
    } catch (error) {
      lastError = error;
      if (window.google?.maps) {
        delete window.google;
      }
    }
  }

  throw lastError;
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

  createLabelMarker(nearbyMap, nearbyMarkers, hotel.location, "Hotel", "marker-hotel", hotel.name, () => {
    nearbyInfoWindow.setContent(`<strong>${hotel.name}</strong><br>${hotel.address || "Address unavailable"}`);
    nearbyInfoWindow.open({ map: nearbyMap, position: hotel.location });
  }, 2000);

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

  createLabelMarker(policeMap, policeMarkers, hotel.location, "Hotel", "marker-hotel", hotel.name, () => {
    policeInfoWindow.setContent(`<strong>${hotel.name}</strong><br>${hotel.address || "Address unavailable"}`);
    policeInfoWindow.open({ map: policeMap, position: hotel.location });
  }, 2000);

  const markerById = new Map();

  stations.forEach((station) => {
    bounds.extend(station.location);

    const marker = createLabelMarker(policeMap, policeMarkers, station.location, "Police", "marker-police", station.name, () => {
      highlightList("#policeList li", station.placeId);
      policeInfoWindow.setContent(`<strong>${station.name}</strong><br>${station.address || "Address unavailable"}`);
      policeInfoWindow.open({ map: policeMap, anchor: marker });
    });

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

function placesService() {
  return new google.maps.places.PlacesService(document.createElement("div"));
}

function categoryLabelFromTypes(types = []) {
  if (types.some((t) => t.includes("restaurant") || t.includes("meal") || t.includes("food") || t.includes("cafe"))) return "Restaurant";
  if (types.includes("clothing_store")) return "Clothing store";
  if (types.includes("store") || types.includes("shopping_mall") || types.includes("department_store") || types.includes("supermarket")) return "Store";
  return null;
}

async function findHotelCandidate(query) {
  const { Place } = await google.maps.importLibrary("places");
  const request = {
    textQuery: query,
    fields: ["id", "displayName", "formattedAddress", "location"],
    maxResultCount: 1
  };

  const { places } = await Place.searchByText(request);
  if (!places || places.length === 0) {
    throw new Error("Hotel not found. Try a more specific name or full address.");
  }
  return places[0];
}

async function placeDetails(placeId) {
  const { Place } = await google.maps.importLibrary("places");
  const place = new Place({ id: placeId });
  await place.fetchFields({
    fields: ["displayName", "formattedAddress", "nationalPhoneNumber", "rating", "websiteURI", "location"]
  });
  return place;
}

async function nearbyByType(location, type) {
  const { Place } = await google.maps.importLibrary("places");
  const request = {
    fields: ["id", "displayName", "formattedAddress", "types", "location"],
    locationRestriction: {
      center: location,
      radius: 1500,
    },
    includedTypes: [type],
    maxResultCount: 20
  };
  try {
    const { places } = await Place.searchNearby(request);
    return places || [];
  } catch (e) {
    return [];
  }
}

function distanceMatrixDriving(origin, destinations) {
  return new Promise((resolve) => {
    if (!destinations.length) {
      resolve([]);
      return;
    }

    new google.maps.DistanceMatrixService().getDistanceMatrix(
      {
        origins: [origin],
        destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC
      },
      (resp, status) => {
        if (status !== "OK") {
          resolve([]);
          return;
        }
        resolve(resp.rows?.[0]?.elements || []);
      }
    );
  });
}

function dedupePlacesById(places) {
  return Array.from(new Map(places.map((p) => [p.id, p])).values());
}

async function fallbackHotelNearbySearch(query) {
  const candidate = await findHotelCandidate(query);
  const hotelDetails = await placeDetails(candidate.id);
  const hotelLoc = hotelDetails.location;

  const [restaurantsRaw, storesRaw, policeRaw] = await Promise.all([
    nearbyByType(hotelLoc, "restaurant"),
    nearbyByType(hotelLoc, "store"),
    nearbyByType(hotelLoc, "police")
  ]);

  const nearbyPlaces = dedupePlacesById([...restaurantsRaw, ...storesRaw])
    .map((p) => {
      if (!p.location) return null;
      const categoryLabel = categoryLabelFromTypes(p.types || []);
      if (!categoryLabel) return null;
      const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(hotelLoc, p.location);
      return {
        placeId: p.id,
        name: p.displayName,
        categoryLabel,
        address: p.formattedAddress || "",
        distanceMeters,
        location: { lat: p.location.lat(), lng: p.location.lng() }
      };
    })
    .filter(Boolean)
    .filter((p) => p.distanceMeters <= 1500)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 120);

  const policeBase = dedupePlacesById(policeRaw)
    .map((p) => {
      if (!p.location) return null;
      const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(hotelLoc, p.location);
      return {
        placeId: p.id,
        name: p.displayName,
        address: p.formattedAddress || "",
        distanceMeters,
        location: { lat: p.location.lat(), lng: p.location.lng() },
        _gLocation: p.location
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3);

  const matrix = await distanceMatrixDriving(hotelLoc, policeBase.map((p) => p._gLocation));

  const policeStations = policeBase.map((p, i) => ({
    placeId: p.placeId,
    name: p.name,
    address: p.address,
    distanceMeters: p.distanceMeters,
    location: p.location,
    drivingDistanceText: matrix[i]?.distance?.text || null,
    drivingDurationText: matrix[i]?.duration?.text || null
  }));

  return {
    hotel: {
      placeId: candidate.id,
      name: hotelDetails.displayName,
      address: hotelDetails.formattedAddress,
      phone: hotelDetails.nationalPhoneNumber || "",
      rating: hotelDetails.rating || null,
      website: hotelDetails.websiteURI || "",
      location: { lat: hotelLoc.lat(), lng: hotelLoc.lng() }
    },
    nearbyPlaces,
    policeStations
  };
}

hotelForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (searchInProgress) {
    statusEl.textContent = "Search already running. Please wait...";
    return;
  }

  const query = hotelNameInput.value.trim();

  if (!query) {
    statusEl.textContent = "Please enter a hotel name or address.";
    return;
  }

  searchInProgress = true;
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";
  }

  statusEl.textContent = "Resolving hotel and loading map data...";

  try {
    await loadGoogleMaps();

    let data;
    try {
      data = await apiFetch("/api/hotel-nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
    } catch (error) {
      const shouldFallback =
        error.message.includes("cannot reach server") ||
        error.message.includes("Fetch failed") ||
        error.message.includes("Request failed (404)") ||
        error.message.includes("Request failed (405)");

      if (shouldFallback) {
        statusEl.textContent = "Using direct Google Maps mode...";
        data = await fallbackHotelNearbySearch(query);
      } else {
        throw error;
      }
    }

    renderHotelInfo(data.hotel);
    renderNearbySection(data.hotel, data.nearbyPlaces || []);
    renderPoliceSection(data.hotel, data.policeStations || []);

    resultCard.hidden = false;
    statusEl.textContent = "Loaded hotel, nearby stores/restaurants, and closest police stations.";
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    searchInProgress = false;
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = "Find hotel";
    }
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

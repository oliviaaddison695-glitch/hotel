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

function readGeminiKeyOverride() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("geminiKey") || params.get("Gemini_API_key") || params.get("gemini_key");

  if (fromQuery && window.localStorage) {
    window.localStorage.setItem("HOTEL_GEMINI_API_KEY", fromQuery);
  }

  return fromQuery || window.localStorage?.getItem("HOTEL_GEMINI_API_KEY") || null;
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

let cityMap;
let nearbyMap;
let policeMap;
let nearbyInfoWindow;
let policeInfoWindow;
let cityMarker;
let nearbyMarkers = [];
let policeMarkers = [];
let googleMapsKey;
let searchInProgress = false;

const DEFAULT_PROMPT = `You are a helpful travel assistant. Provide a comprehensive overview of the city where {{HOTEL_NAME}} ({{ADDRESS}}) is located, and a description of the hotel itself.

Please format your response in clean HTML (using <h2>, <h4>, <p>, <ul>, <li>, and <strong> tags). Do NOT use markdown. Do NOT wrap the response in a markdown code block (\`\`\`html). Just return the raw HTML string.

Include the following sections:
<h2>City</h2>
1. City Overview: Describe the general vibe, local culture, main travel season, and typical weather.
2. Safety: Mention general safety considerations and include a hyperlink to the Numbeo crime index for this city (e.g., <a href="https://www.numbeo.com/crime/in/City-Name" target="_blank">Numbeo Crime Data for [City]</a>).

<h2>Hotel</h2>
3. Hotel Information: What amenities can guests expect? What is the general manager info (if publicly known, otherwise skip)? What are the typical guest demographics?`;

// Admin UI Elements
const adminToggleBtn = document.getElementById("adminToggleBtn");
const adminPanel = document.getElementById("adminPanel");
const adminGeminiPrompt = document.getElementById("adminGeminiPrompt");
const adminStoreRadius = document.getElementById("adminStoreRadius");
const adminPoliceLimit = document.getElementById("adminPoliceLimit");
const saveAdminBtn = document.getElementById("saveAdminBtn");
const adminStatus = document.getElementById("adminStatus");

function loadAdminSettings() {
  const settingsStr = window.localStorage?.getItem("HOTEL_ADMIN_SETTINGS");
  let settings = {
    prompt: DEFAULT_PROMPT,
    storeRadius: 1500,
    policeLimit: 3
  };

  if (settingsStr) {
    try {
      settings = { ...settings, ...JSON.parse(settingsStr) };
    } catch(e) {}
  }

  adminGeminiPrompt.value = settings.prompt;
  adminStoreRadius.value = settings.storeRadius;
  adminPoliceLimit.value = settings.policeLimit;

  return settings;
}

const currentAdminSettings = loadAdminSettings();

adminToggleBtn?.addEventListener("click", () => {
  adminPanel.hidden = !adminPanel.hidden;
});

saveAdminBtn?.addEventListener("click", () => {
  const newSettings = {
    prompt: adminGeminiPrompt.value || DEFAULT_PROMPT,
    storeRadius: parseInt(adminStoreRadius.value) || 1500,
    policeLimit: parseInt(adminPoliceLimit.value) || 3
  };
  window.localStorage?.setItem("HOTEL_ADMIN_SETTINGS", JSON.stringify(newSettings));

  // Update current runtime settings
  Object.assign(currentAdminSettings, newSettings);

  adminStatus.textContent = "Saved!";
  setTimeout(() => { adminStatus.textContent = ""; }, 2000);
});

function categoryClass(categoryLabel) {
  if (categoryLabel === "Restaurant") return "marker-restaurant";
  if (categoryLabel === "Clothing store") return "marker-clothing";
  if (categoryLabel === "Police") return "marker-police";
  if (categoryLabel === "Bar") return "marker-bar";
  if (categoryLabel === "Park") return "marker-park";
  if (categoryLabel === "Parking") return "marker-parking";
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
        script.src = `https://maps.googleapis.com/maps/api/js?key=${candidateKey}&libraries=marker,places,geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          setTimeout(() => {
            if (window.google?.maps?.places) {
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

  // Render City Map
  cityMap = cityMap || new google.maps.Map(document.getElementById("cityMap"), {
    center: hotel.location,
    zoom: 13,
    mapId: "DEMO_MAP_ID",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });
  cityMap.setCenter(hotel.location);

  if (cityMarker) {
    cityMarker.map = null;
  }

  const markerContent = document.createElement("div");
  markerContent.className = "marker-label marker-hotel";
  markerContent.textContent = "Hotel";

  cityMarker = new google.maps.marker.AdvancedMarkerElement({
    map: cityMap,
    position: hotel.location,
    content: markerContent,
    title: hotel.name,
    zIndex: 2000
  });
}

function renderNearbySection(hotel, places) {
  nearbyMap = nearbyMap || new google.maps.Map(document.getElementById("nearbyMap"), {
    center: hotel.location,
    zoom: 17,
    mapId: "DEMO_MAP_ID",
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
    // Google Maps fitBounds executes asynchronously in some cases, so wait for bounds_changed
    // or just listen once to enforce a maximum zoom (which prevents zooming IN too far)
    google.maps.event.addListenerOnce(nearbyMap, 'bounds_changed', function() {
      const z = nearbyMap.getZoom();
      if (z > 16) nearbyMap.setZoom(16);
    });
  } else {
    nearbyMap.setZoom(16);
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
    mapId: "DEMO_MAP_ID",
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

  if (stations.length) {
    policeMap.fitBounds(bounds, 80);
    google.maps.event.addListenerOnce(policeMap, 'bounds_changed', function() {
      const z = policeMap.getZoom();
      if (z > 16) policeMap.setZoom(16);
    });
  } else {
    policeMap.setZoom(14);
  }

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
  if (types.includes("bar")) return "Bar";
  if (types.includes("park")) return "Park";
  if (types.includes("parking")) return "Parking";
  if (types.includes("store") || types.includes("shopping_mall") || types.includes("department_store") || types.includes("supermarket")) return "Store";
  return null;
}

function findHotelCandidate(query) {
  return new Promise((resolve, reject) => {
    placesService().findPlaceFromQuery(
      { query, fields: ["place_id", "name", "formatted_address", "geometry"] },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          reject(new Error("Hotel not found. Try a more specific name or full address."));
          return;
        }
        resolve(results[0]);
      }
    );
  });
}

function placeDetails(placeId) {
  return new Promise((resolve, reject) => {
    placesService().getDetails(
      { placeId, fields: ["name", "formatted_address", "formatted_phone_number", "rating", "website", "geometry", "photos"] },
      (result, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !result) {
          reject(new Error("Could not load hotel details."));
          return;
        }
        resolve(result);
      }
    );
  });
}

function searchCityPhotoFallback(address) {
  return new Promise((resolve) => {
    const match = address.match(/([^,]+),\s*([^,]+)$/);
    let cityQuery = address;
    if (match) {
      cityQuery = `City of ${match[1]}`;
    } else {
      cityQuery = `City of ${address}`;
    }

    placesService().textSearch(
      { query: cityQuery },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0 && results[0].photos && results[0].photos.length > 0) {
          resolve(results[0].photos[0].getUrl({ maxWidth: 800 }));
        } else {
          resolve(null);
        }
      }
    );
  });
}

function nearbyByType(location, type) {
  return new Promise((resolve) => {
    placesService().nearbySearch(
      { location, rankBy: google.maps.places.RankBy.DISTANCE, type },
      (results) => resolve(results || [])
    );
  });
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
  return Array.from(new Map(places.map((p) => [p.place_id, p])).values());
}

async function fetchClientGeminiInfo(hotelName, address) {
  const apiKey = readGeminiKeyOverride();
  if (!apiKey) return null;

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    let validModels = [];
    if (listData.models) {
      validModels = listData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")).map(m => m.name);
    }

    const preferredModels = ['models/gemini-1.5-flash', 'models/gemini-pro', 'models/gemini-1.0-pro'];
    let selectedModel = null;

    for (const pModel of preferredModels) {
      if (validModels.includes(pModel)) {
        selectedModel = pModel;
        break;
      }
    }

    if (!selectedModel && validModels.length > 0) {
        selectedModel = validModels[0];
    }

    if (!selectedModel) {
        return `<p>Could not fetch AI information.</p><p style="color:red">Gemini API Error: No valid text generation models found for this API key.</p>`;
    }

    const prompt = currentAdminSettings.prompt
      .replaceAll("{{HOTEL_NAME}}", hotelName)
      .replaceAll("{{ADDRESS}}", address);

    let modelName = selectedModel.replace(/^models\//, '');
    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      return "Could not fetch AI information. Invalid response from AI service.";
    }

    if (!response.ok && (data?.error?.message?.includes("is not found") || response.status === 404)) {
        console.warn(`Model ${modelName} failed on client. Falling back to gemini-1.0-pro.`);
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        });

        try {
          data = await response.json();
        } catch (e) {
          return "Could not fetch AI information. Invalid response from AI service.";
        }
    }

    if (!response.ok) {
        console.error("Client Gemini API error:", data);
        const errMsg = data?.error?.message || "Unknown error";
        return `<p>Could not fetch AI information.</p><p style="color:red">Gemini API Error: ${errMsg}</p>`;
    }

    let htmlContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "No AI information returned.";
    htmlContent = htmlContent.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    return htmlContent;

  } catch (err) {
    console.error("Client Gemini fetch error:", err);
    return "<p>Failed to connect to AI service from the browser.</p>";
  }
}

async function fallbackHotelNearbySearch(query) {
  const candidate = await findHotelCandidate(query);
  const hotelDetails = await placeDetails(candidate.place_id);
  const hotelLoc = hotelDetails.geometry.location;

  const [restaurantsRaw, storesRaw, policeRaw, barsRaw, parksRaw, parkingRaw] = await Promise.all([
    nearbyByType(hotelLoc, "restaurant"),
    nearbyByType(hotelLoc, "store"),
    nearbyByType(hotelLoc, "police"),
    nearbyByType(hotelLoc, "bar"),
    nearbyByType(hotelLoc, "park"),
    nearbyByType(hotelLoc, "parking")
  ]);

  const nearbyPlaces = dedupePlacesById([...restaurantsRaw, ...storesRaw, ...barsRaw, ...parksRaw, ...parkingRaw])
    .map((p) => {
      if (!p.geometry?.location) return null;
      const categoryLabel = categoryLabelFromTypes(p.types || []);
      if (!categoryLabel) return null;
      const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(hotelLoc, p.geometry.location);
      return {
        placeId: p.place_id,
        name: p.name,
        categoryLabel,
        address: p.vicinity || p.formatted_address || "",
        distanceMeters,
        location: { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() }
      };
    })
    .filter(Boolean)
    .filter((p) => p.distanceMeters <= currentAdminSettings.storeRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 120);

  const policeBase = dedupePlacesById(policeRaw)
    .map((p) => {
      if (!p.geometry?.location) return null;
      const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(hotelLoc, p.geometry.location);
      return {
        placeId: p.place_id,
        name: p.name,
        address: p.vicinity || p.formatted_address || "",
        distanceMeters,
        location: { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() },
        _gLocation: p.geometry.location
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, currentAdminSettings.policeLimit);

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

  const aiInfo = await fetchClientGeminiInfo(hotelDetails.name, hotelDetails.formatted_address);

  let hotelPhotoUrl = null;
  if (hotelDetails.photos && hotelDetails.photos.length > 0) {
    hotelPhotoUrl = hotelDetails.photos[0].getUrl({ maxWidth: 800 });
  }

  const cityPhotoUrl = await searchCityPhotoFallback(hotelDetails.formatted_address);

  return {
    hotel: {
      placeId: candidate.place_id,
      name: hotelDetails.name,
      address: hotelDetails.formatted_address,
      phone: hotelDetails.formatted_phone_number || "",
      rating: hotelDetails.rating || null,
      website: hotelDetails.website || "",
      location: { lat: hotelLoc.lat(), lng: hotelLoc.lng() },
      photoUrl: hotelPhotoUrl,
      cityPhotoUrl: cityPhotoUrl
    },
    nearbyPlaces,
    policeStations,
    aiInfo
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
        body: JSON.stringify({
          query,
          adminSettings: currentAdminSettings
        })
      });
    } catch (error) {
      console.warn("Backend search failed, falling back to browser API.", error);
      statusEl.textContent = "Using direct Google Maps mode...";
      data = await fallbackHotelNearbySearch(query);
    }

    resultCard.hidden = false;
    // Force a layout reflow so Google Maps calculates dimensions correctly for fitBounds
    void resultCard.offsetHeight;

    renderHotelInfo(data.hotel);
    renderNearbySection(data.hotel, data.nearbyPlaces || []);
    renderPoliceSection(data.hotel, data.policeStations || []);

    statusEl.textContent = "Loaded hotel, nearby stores/restaurants, and closest police stations.";
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    const aiCityTabBtn = document.querySelector(".tab-button[data-target=\"tab-city-ai\"]");
    const aiHotelTabBtn = document.querySelector(".tab-button[data-target=\"tab-hotel-ai\"]");
    const aiCityContent = document.getElementById("aiCityContent");
    const aiHotelContent = document.getElementById("aiHotelContent");

    if (aiCityTabBtn && aiHotelTabBtn && aiCityContent && aiHotelContent) {
      if (data.aiInfo) {
        let aiHtml = data.aiInfo;
        let cityHtml = "";
        let hotelHtml = "";

        // Split AI response based on headers
        const hotelIndex = aiHtml.indexOf("<h2>Hotel</h2>");
        if (hotelIndex !== -1) {
          cityHtml = aiHtml.substring(0, hotelIndex);
          hotelHtml = aiHtml.substring(hotelIndex);
        } else {
          cityHtml = aiHtml;
          hotelHtml = "<p>No specific hotel information returned.</p>";
        }

        let apiKey = googleMapsKey || FALLBACK_BROWSER_MAPS_KEY;
        let cUrl = data.hotel.cityPhotoUrl;
        if (!cUrl && data.hotel.cityPhotoRef) {
          cUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${data.hotel.cityPhotoRef}&key=${apiKey}`;
        }

        let hUrl = data.hotel.photoUrl;
        if (!hUrl && data.hotel.photoRef) {
          hUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${data.hotel.photoRef}&key=${apiKey}`;
        }

        if (cUrl) {
           cityHtml = cityHtml.replace("<h2>City</h2>", `<h2>City</h2>\n<img class="ai-section-img" src="${cUrl}" alt="City photo" style="max-width:100%; border-radius:8px; margin-bottom:1rem;">`);
        }

        if (hUrl) {
           hotelHtml = hotelHtml.replace("<h2>Hotel</h2>", `<h2>Hotel</h2>\n<img class="ai-section-img" src="${hUrl}" alt="Hotel photo" style="max-width:100%; border-radius:8px; margin-bottom:1rem;">`);
        }

        aiCityContent.innerHTML = cityHtml;
        aiHotelContent.innerHTML = hotelHtml;
        aiCityTabBtn.style.display = "inline-block";
        aiHotelTabBtn.style.display = "inline-block";
      } else {
        const fallbackMsg = "<p>AI information is only available when running the backend server with a configured Gemini API key. Alternatively, you can use the frontend-only mode by passing your key in the URL like <code>?Gemini_API_key=YOUR_KEY</code></p>";
        aiCityContent.innerHTML = fallbackMsg;
        aiHotelContent.innerHTML = fallbackMsg;
        aiCityTabBtn.style.display = "inline-block";
        aiHotelTabBtn.style.display = "inline-block";
      }
    }

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

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const targetId = btn.getAttribute("data-target");
    if (targetId) {
      document.getElementById(targetId)?.classList.add("active");
    }
  });
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

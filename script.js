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

const triggerWorkflowBtn = document.getElementById("triggerWorkflowBtn");
const driveFolderBtn = document.getElementById("driveFolderBtn");
const workflowStatus = document.getElementById("workflowStatus");

let googleMapsKey;
let searchInProgress = false;

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
          window.gm_authFailed = true;
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

function renderHotelInfo(hotel) {
  nameEl.textContent = hotel.name || "N/A";
  addressEl.textContent = hotel.address || "Address unavailable";
  phoneEl.textContent = hotel.phone || "Phone unavailable";
  ratingEl.textContent = hotel.rating ? `${hotel.rating} / 5` : "Not available";

  websiteLink.href = hotel.website || `https://www.google.com/search?q=${encodeURIComponent(hotel.name || "hotel")}`;
  buildSearchLinks(hotel.name || "hotel", hotel.address || "");
}

function placesService() {
  return new google.maps.places.PlacesService(document.createElement("div"));
}

function checkAuthAndTimeout(executor, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.gm_authFailed) {
      reject(new Error("Google Maps authentication failed. Please check your API key."));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error("Google Maps API request timed out."));
    }, timeoutMs);

    executor(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function findHotelCandidate(query) {
  return checkAuthAndTimeout((resolve, reject) => {
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
  return checkAuthAndTimeout((resolve, reject) => {
    placesService().getDetails(
      { placeId, fields: ["name", "formatted_address", "formatted_phone_number", "rating", "website", "geometry"] },
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

async function fallbackHotelNearbySearch(query) {
  const candidate = await findHotelCandidate(query);
  const hotelDetails = await placeDetails(candidate.place_id);
  const hotelLoc = hotelDetails.geometry.location;

  return {
    hotel: {
      placeId: candidate.place_id,
      name: hotelDetails.name,
      address: hotelDetails.formatted_address,
      phone: hotelDetails.formatted_phone_number || "",
      rating: hotelDetails.rating || null,
      website: hotelDetails.website || "",
      location: { lat: hotelLoc.lat(), lng: hotelLoc.lng() }
    }
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
      console.warn("Server API failed, falling back to direct browser mode:", error.message);
      statusEl.textContent = "Using direct Google Maps mode...";
      data = await fallbackHotelNearbySearch(query);
    }

    renderHotelInfo(data.hotel);

    resultCard.hidden = false;
    statusEl.textContent = "Loaded hotel information.";
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

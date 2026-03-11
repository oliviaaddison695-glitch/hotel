const GOOGLE_MAPS_API_KEY = "AIzaSyCPYoWbh0n0jPYkIQmN5NuEn0CFMtoeYMs";
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

const vibePanel = document.getElementById("vibePanel");
const areaPanel = document.getElementById("areaPanel");
const nearbyList = document.getElementById("nearbyList");

const triggerWorkflowBtn = document.getElementById("triggerWorkflowBtn");
const driveFolderBtn = document.getElementById("driveFolderBtn");
const workflowStatus = document.getElementById("workflowStatus");

let cityMap;
let satelliteMap;
let streetMap;
let marker;
let satelliteMarkers = [];

async function loadGoogleMaps() {
  if (window.google?.maps) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function buildSearchLinks(hotelName, address) {
  const query = encodeURIComponent(`${hotelName} ${address}`);
  tripLink.href = `https://www.tripadvisor.com/Search?q=${query}`;
  bookingLink.href = `https://www.booking.com/searchresults.html?ss=${query}`;
}

function hotelVibeFromTypes(types = []) {
  if (types.includes("spa")) return "Relaxed and wellness-focused vibe, likely popular for comfort stays.";
  if (types.includes("resort")) return "Resort-style vibe with leisure-focused amenities and longer stays.";
  return "Balanced hotel vibe, likely suitable for both business and leisure travelers.";
}

function areaVibeFromNearby(nearby = []) {
  if (!nearby.length) return "Area vibe unavailable yet. Try searching a more specific hotel name.";

  const names = nearby.slice(0, 8).flatMap((place) => place.types || []);
  const restaurantCount = names.filter((n) => n.includes("restaurant") || n.includes("cafe")).length;
  const nightlifeCount = names.filter((n) => n.includes("bar") || n.includes("night_club")).length;

  if (nightlifeCount >= 2) return "Lively area with nightlife and social spots nearby.";
  if (restaurantCount >= 3) return "Food-friendly area with many dining options around the hotel.";
  return "Calm mixed-use area with basic services and local points of interest.";
}

function getPlacePredictions(query) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.createElement("div"));
    service.findPlaceFromQuery(
      {
        query,
        fields: ["place_id", "name"]
      },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          reject(new Error("No hotels found."));
          return;
        }
        resolve(results[0]);
      }
    );
  });
}

function getPlaceDetails(placeId) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.createElement("div"));
    service.getDetails(
      {
        placeId,
        fields: [
          "name",
          "formatted_address",
          "formatted_phone_number",
          "rating",
          "geometry",
          "website",
          "types"
        ]
      },
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

function getNearby(location) {
  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement("div"));
    service.nearbySearch(
      {
        location,
        radius: 1000
      },
      (results) => resolve(results || [])
    );
  });
}

async function searchHotel(query) {
  const bestMatch = await getPlacePredictions(`${query} hotel`);
  const hotel = await getPlaceDetails(bestMatch.place_id);
  const nearby = await getNearby(hotel.geometry.location);
  return { hotel, nearby };
}

function clearSatelliteMarkers() {
  satelliteMarkers.forEach((item) => item.setMap(null));
  satelliteMarkers = [];
}

function renderNearbyPlacesOnSatellite(places, hotelPosition) {
  const shownPlaces = places
    .filter((place) => {
      const types = place.types || [];
      return types.includes("restaurant") || types.includes("cafe") || types.includes("store") || types.includes("shopping_mall");
    })
    .slice(0, 20);

  clearSatelliteMarkers();

  const infoWindow = new google.maps.InfoWindow();
  shownPlaces.forEach((place) => {
    if (!place.geometry?.location) return;

    const markerColor = (place.types || []).includes("restaurant") || (place.types || []).includes("cafe")
      ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
      : "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";

    const placeMarker = new google.maps.Marker({
      map: satelliteMap,
      position: place.geometry.location,
      title: place.name,
      icon: markerColor
    });

    placeMarker.addListener("click", () => {
      infoWindow.setContent(`<strong>${place.name}</strong><br/>${(place.types || []).slice(0, 2).join(", ")}`);
      infoWindow.open({ anchor: placeMarker, map: satelliteMap });
    });

    satelliteMarkers.push(placeMarker);
  });

  const hotelMarker = new google.maps.Marker({
    map: satelliteMap,
    position: hotelPosition,
    title: "Hotel",
    icon: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png"
  });
  satelliteMarkers.push(hotelMarker);

  nearbyList.innerHTML = shownPlaces.length
    ? shownPlaces
        .slice(0, 10)
        .map((place) => `<span>${place.name}</span>`)
        .join("")
    : "<span>No nearby stores/restaurants found in this area.</span>";
}

function renderMaps(hotel, nearby) {
  const position = hotel.geometry.location;

  cityMap = cityMap || new google.maps.Map(document.getElementById("cityMap"), {
    zoom: 13,
    center: position,
    mapTypeControl: false
  });
  cityMap.setCenter(position);

  if (marker) marker.setMap(null);
  marker = new google.maps.Marker({
    position,
    map: cityMap,
    title: hotel.name
  });

  satelliteMap = satelliteMap || new google.maps.Map(document.getElementById("satelliteMap"), {
    zoom: 17,
    center: position,
    mapTypeId: "satellite",
    tilt: 0
  });
  satelliteMap.setCenter(position);
  renderNearbyPlacesOnSatellite(nearby, position);

  streetMap = streetMap || new google.maps.StreetViewPanorama(document.getElementById("streetMap"), {
    position,
    pov: { heading: 210, pitch: 10 },
    zoom: 1
  });
  streetMap.setPosition(position);
}

function renderHotelInfo(hotel, nearby) {
  nameEl.textContent = hotel.name ?? "N/A";
  addressEl.textContent = hotel.formatted_address ?? "Address unavailable";
  phoneEl.textContent = hotel.formatted_phone_number ?? "Phone unavailable";
  ratingEl.textContent = hotel.rating ? `${hotel.rating} / 5` : "Not available";

  websiteLink.href = hotel.website || `https://www.google.com/search?q=${encodeURIComponent(hotel.name)}`;
  buildSearchLinks(hotel.name, hotel.formatted_address ?? "");

  vibePanel.textContent = hotelVibeFromTypes(hotel.types);
  areaPanel.textContent = areaVibeFromNearby(nearby);

  resultCard.hidden = false;
}

hotelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Searching hotel...";

  try {
    await loadGoogleMaps();
    const query = hotelNameInput.value.trim();
    const { hotel, nearby } = await searchHotel(query);

    renderHotelInfo(hotel, nearby);
    renderMaps(hotel, nearby);
    statusEl.textContent = "Hotel loaded successfully.";
  } catch (error) {
    statusEl.textContent = `Could not load hotel info: ${error.message}`;
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const showVibe = tab.dataset.tab === "vibe";
    vibePanel.classList.toggle("hidden", !showVibe);
    areaPanel.classList.toggle("hidden", showVibe);
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

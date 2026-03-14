const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const GOOGLE_MAPS_SERVER_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
const GOOGLE_MAPS_BROWSER_API_KEY = process.env.GOOGLE_MAPS_BROWSER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const STORE_MAP_MAX_DISTANCE_METERS = Number(process.env.STORE_MAP_MAX_DISTANCE_METERS || 350);
const STORE_MAP_MAX_RESULTS = Number(process.env.STORE_MAP_MAX_RESULTS || 120);
const POLICE_MAX_RESULTS = Number(process.env.POLICE_MAX_RESULTS || 3);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": MIME[".json"] });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": MIME[".txt"] });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function mapCategoryLabel(types = []) {
  if (types.some((t) => t.includes("restaurant") || t.includes("meal") || t.includes("food") || t.includes("cafe"))) return "Restaurant";
  if (types.includes("clothing_store")) return "Clothing store";
  if (types.includes("store") || types.includes("shopping_mall") || types.includes("department_store") || types.includes("supermarket")) return "Store";
  return null;
}

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (error) {
    throw new Error(`Network error while calling Google API: ${error.message}`);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok || (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
    const msg = data.error_message || data.status || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function resolveHotel(query) {
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry&key=${GOOGLE_MAPS_SERVER_API_KEY}`;
  const data = await fetchJson(url);
  if (!data.candidates?.length) throw new Error("Hotel not found. Try a more specific name or full address.");
  return data.candidates[0];
}

async function getHotelDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,formatted_phone_number,rating,website,geometry&key=${GOOGLE_MAPS_SERVER_API_KEY}`;
  const data = await fetchJson(url);
  return data.result;
}

async function nearbySearchByType(location, type) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&rankby=distance&type=${encodeURIComponent(type)}&key=${GOOGLE_MAPS_SERVER_API_KEY}`;
  const data = await fetchJson(url);
  return data.results || [];
}

async function distanceMatrixDriving(origin, destinations) {
  if (!destinations.length) return [];

  const destinationsParam = destinations.map((d) => `${d.lat},${d.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${encodeURIComponent(destinationsParam)}&mode=driving&units=metric&key=${GOOGLE_MAPS_SERVER_API_KEY}`;

  const data = await fetchJson(url);
  return data.rows?.[0]?.elements || [];
}

function dedupeByPlaceId(places) {
  return Array.from(new Map(places.map((p) => [p.place_id, p])).values());
}

function formatGoogleError(error) {
  const msg = error.message || "Unknown Google API error";

  if (msg.includes("REQUEST_DENIED") || msg.includes("API key") || msg.includes("The provided API key is invalid")) {
    return "Google API key issue: verify GOOGLE_MAPS_SERVER_API_KEY and key restrictions.";
  }
  if (msg.includes("BILLING") || msg.includes("billing")) {
    return "Google billing issue: enable billing for this Google Cloud project.";
  }
  if (msg.includes("OVER_QUERY_LIMIT") || msg.includes("quota")) {
    return "Google quota issue: your project exceeded API quota.";
  }
  return msg;
}

async function fetchGeminiInfo(hotelName, address) {
  if (!GEMINI_API_KEY) return "AI information not available. Please configure the GEMINI_API_KEY server environment variable.";

  try {
    const prompt = `You are a helpful travel assistant. Provide a comprehensive overview of the city where ${hotelName} (${address}) is located, and a description of the hotel itself.

Please format your response in clean HTML (using <h4>, <p>, <ul>, <li>, and <strong> tags). Do NOT use markdown. Do NOT wrap the response in a markdown code block (\`\`\`html). Just return the raw HTML string.

Include the following sections:
1. City Overview: Describe the general vibe, local culture, main travel season, and typical weather.
2. Safety: Mention general safety considerations and include a hyperlink to the Numbeo crime index for this city (e.g., <a href="https://www.numbeo.com/crime/in/City-Name" target="_blank">Numbeo Crime Data for [City]</a>).
3. Hotel Information: What amenities can guests expect? What is the general manager info (if publicly known, otherwise skip)? What are the typical guest demographics?`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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

    let data;
    try {
      data = await response.json();
    } catch (e) {
      return "Could not fetch AI information. Invalid response from AI service.";
    }

    if (!response.ok) {
      console.error("Gemini API error:", data);
      const errMsg = data?.error?.message || "Unknown error";
      return `<p>Could not fetch AI information.</p><p style="color:red">Gemini API Error: ${errMsg}</p>`;
    }

    let htmlContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "No AI information returned.";
    // Clean up potential markdown formatting that Gemini sometimes insists on adding
    htmlContent = htmlContent.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    return htmlContent;
  } catch (err) {
    console.error("Gemini fetch error:", err);
    return "Failed to connect to AI service.";
  }
}

async function handleHotelNearby(req, res) {
  try {
    if (!GOOGLE_MAPS_SERVER_API_KEY) {
      sendJson(res, 500, { error: "Missing GOOGLE_MAPS_SERVER_API_KEY in environment." });
      return;
    }

    const body = await parseBody(req);
    const query = String(body?.query || "").trim();

    if (!query) {
      sendJson(res, 400, { error: "Please provide a hotel name or address." });
      return;
    }

    const hotelCandidate = await resolveHotel(query);
    const hotel = await getHotelDetails(hotelCandidate.place_id);

    if (!hotel?.geometry?.location) {
      sendJson(res, 500, { error: "Hotel resolved but no coordinates were returned." });
      return;
    }

    const hotelLocation = { lat: hotel.geometry.location.lat, lng: hotel.geometry.location.lng };

    const [restaurantRaw, storeRaw, policeRaw] = await Promise.all([
      nearbySearchByType(hotelLocation, "restaurant"),
      nearbySearchByType(hotelLocation, "store"),
      nearbySearchByType(hotelLocation, "police")
    ]);

    const streetPlaces = dedupeByPlaceId([...restaurantRaw, ...storeRaw])
      .map((p) => {
        if (!p.geometry?.location) return null;
        const categoryLabel = mapCategoryLabel(p.types || []);
        if (!categoryLabel) return null;
        const location = { lat: p.geometry.location.lat, lng: p.geometry.location.lng };
        const distanceMeters = haversineMeters(hotelLocation, location);
        return {
          placeId: p.place_id,
          name: p.name,
          categoryLabel,
          address: p.vicinity || p.formatted_address || "",
          distanceMeters,
          location
        };
      })
      .filter(Boolean)
      .filter((p) => p.distanceMeters <= STORE_MAP_MAX_DISTANCE_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, STORE_MAP_MAX_RESULTS);

    const nearestPolice = dedupeByPlaceId(policeRaw)
      .map((p) => {
        if (!p.geometry?.location) return null;
        const location = { lat: p.geometry.location.lat, lng: p.geometry.location.lng };
        const distanceMeters = haversineMeters(hotelLocation, location);
        return {
          placeId: p.place_id,
          name: p.name,
          address: p.vicinity || p.formatted_address || "",
          distanceMeters,
          location
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, POLICE_MAX_RESULTS);

    const matrix = await distanceMatrixDriving(
      hotelLocation,
      nearestPolice.map((p) => p.location)
    );

    const policeWithDriving = nearestPolice.map((p, i) => ({
      ...p,
      drivingDistanceText: matrix[i]?.distance?.text || null,
      drivingDurationText: matrix[i]?.duration?.text || null
    }));

    const aiInfo = await fetchGeminiInfo(hotel.name, hotel.formatted_address);

    sendJson(res, 200, {
      hotel: {
        placeId: hotelCandidate.place_id,
        name: hotel.name,
        address: hotel.formatted_address,
        phone: hotel.formatted_phone_number || "",
        rating: hotel.rating || null,
        website: hotel.website || "",
        location: hotelLocation
      },
      mapModes: {
        storesRestaurants: {
          strategy: "tight street-level auto area",
          maxDistanceMeters: STORE_MAP_MAX_DISTANCE_METERS,
          maxResults: STORE_MAP_MAX_RESULTS
        },
        police: {
          strategy: "closest police stations to hotel",
          maxResults: POLICE_MAX_RESULTS
        }
      },
      nearbyPlaces: streetPlaces,
      policeStations: policeWithDriving,
      aiInfo: aiInfo
    });
  } catch (error) {
    sendJson(res, 500, { error: formatGoogleError(error), raw: error.message || String(error) });
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && reqUrl.pathname === "/api/config") {
    if (!GOOGLE_MAPS_BROWSER_API_KEY) {
      sendJson(res, 500, { error: "Missing GOOGLE_MAPS_BROWSER_API_KEY in environment." });
      return;
    }

    sendJson(res, 200, {
      mapsApiKey: GOOGLE_MAPS_BROWSER_API_KEY,
      defaults: {
        storeMapMaxDistanceMeters: STORE_MAP_MAX_DISTANCE_METERS,
        storeMapMaxResults: STORE_MAP_MAX_RESULTS,
        policeMaxResults: POLICE_MAX_RESULTS
      }
    });
    return;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/hotel-nearby") {
    await handleHotelNearby(req, res);
    return;
  }

  if (req.method === "GET") {
    const pathname = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
    const safePath = path.normalize(path.join(__dirname, pathname));

    if (!safePath.startsWith(__dirname)) {
      res.writeHead(403, { "Content-Type": MIME[".txt"] });
      res.end("Forbidden");
      return;
    }

    sendFile(res, safePath);
    return;
  }

  res.writeHead(405, { "Content-Type": MIME[".txt"] });
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Hotel app server listening on http://localhost:${PORT}`);
});

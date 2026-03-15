const http = require("http");

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && reqUrl.pathname === "/api/hotel-nearby") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      hotel: {
        placeId: "mock",
        name: "Mock Hotel",
        address: "123 Mock St",
        phone: "555-1234",
        rating: 4.5,
        website: "http://mock.com",
        location: { lat: 41.39, lng: 2.19 },
        photoRef: "mock1",
        cityPhotoRef: "mock2"
      },
      mapModes: {
        storesRestaurants: { strategy: "mock", maxDistanceMeters: 1500, maxResults: 100 },
        police: { strategy: "mock", maxResults: 5 }
      },
      nearbyPlaces: [{
        placeId: "mock_place",
        name: "Mock Park",
        categoryLabel: "Park",
        address: "456 Park Ave",
        distanceMeters: 50,
        location: { lat: 41.391, lng: 2.191 }
      }],
      policeStations: [],
      aiInfo: "<h2>City</h2><p>Mock City</p><h2>Hotel</h2><p>Mock Hotel Description</p>"
    }));
    return;
  }

  // proxy the rest to the main server script or just serve it here
  if (req.method === "GET" && reqUrl.pathname === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mapsApiKey: "AIzaSyCPYoWbh0n0jPYkIQmN5NuEn0CFMtoeYMs" }));
      return;
  }
});

server.listen(4174, () => console.log("Mock API on 4174"));

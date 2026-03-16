const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".txt": "text/plain",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && reqUrl.pathname === "/api/hotel-nearby") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const mockPayload = {
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
      },
      {
        placeId: "mock_place_2",
        name: "Mock Bar",
        categoryLabel: "Bar",
        address: "456 Bar Ave",
        distanceMeters: 60,
        location: { lat: 41.392, lng: 2.192 }
      },
      {
        placeId: "mock_place_3",
        name: "Mock Parking",
        categoryLabel: "Parking",
        address: "456 Parking Ave",
        distanceMeters: 70,
        location: { lat: 41.393, lng: 2.193 }
      }
      ],
      policeStations: [],
      aiInfo: "<h2>City</h2><p>Mock City</p><h2>Hotel</h2><p>Mock Hotel Description</p>"
    }
    res.end(JSON.stringify(mockPayload));
    return;
  }

  if (req.method === "GET" && reqUrl.pathname === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mapsApiKey: "AIzaSyCPYoWbh0n0jPYkIQmN5NuEn0CFMtoeYMs" }));
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

    fs.readFile(safePath, (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404, { "Content-Type": MIME[".txt"] });
          res.end("Not Found");
        } else {
          res.writeHead(500, { "Content-Type": MIME[".txt"] });
          res.end("Internal Server Error");
        }
        return;
      }

      const ext = path.extname(safePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || MIME[".txt"] });
      res.end(data);
    });
    return;
  }
});

server.listen(4174, () => console.log("Mock API on 4174"));

# Hotel Info Explorer Setup

## Prerequisites
- Node.js (v18+ recommended)
- A Google Cloud project with billing enabled.

## Required Google APIs to Enable
You must enable the following APIs in your Google Cloud Console:
1.  **Places API (New)**
2.  **Places API** (Legacy)
3.  **Distance Matrix API**
4.  **Maps JavaScript API**

## Environment Variables
Create a `.env` file in the root directory and configure it with your API keys:

```ini
# Server-side API key (Unrestricted, Keep Secret!)
# Used for backend Places API and Distance Matrix lookups
GOOGLE_MAPS_SERVER_API_KEY=your_server_api_key_here

# Client-side API key (Must be restricted by HTTP referrers!)
# Used for rendering the interactive map and markers on the frontend
GOOGLE_MAPS_BROWSER_API_KEY=your_browser_api_key_here

# (Optional) Map Settings
STORE_MAP_MAX_DISTANCE_METERS=1500
STORE_MAP_MAX_RESULTS=120
POLICE_MAX_RESULTS=3
PORT=4173
```

## Running the App
1. Install any dependencies (if applicable) or simply start the built-in server:
   ```bash
   node server.js
   ```
2. Open your browser and navigate to `http://localhost:4173/`.
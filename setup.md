# Setup Instructions

## 1. Prerequisites
- Node.js (v16+ recommended)
- A Google Cloud Platform account with billing enabled

## 2. Required Google APIs
Enable the following APIs in your Google Cloud Console:
- **Places API (New)**
- **Maps JavaScript API**
- **Distance Matrix API**
- **Geocoding API** (optional but recommended)

## 3. Environment Variables
1. Copy `.env.example` to `.env`
2. Fill in the required variables:
   - `GOOGLE_MAPS_SERVER_API_KEY`: A key restricted to your server's IP addresses.
   - `GOOGLE_MAPS_BROWSER_API_KEY`: A key restricted to your website's HTTP referrers.

## 4. Running the App
1. Install dependencies:
   `npm install`
2. Start the server:
   `node server.js`
3. Open http://localhost:4173 in your browser.
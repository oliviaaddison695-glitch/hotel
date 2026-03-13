const fs = require('fs');
if (!process.env.GOOGLE_MAPS_SERVER_API_KEY || !process.env.GOOGLE_MAPS_BROWSER_API_KEY) {
    console.log("Keys missing!");
} else {
    console.log("Keys present");
}

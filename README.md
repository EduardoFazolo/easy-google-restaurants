# Easy Google Places

A TypeScript library to query Google Places API with automatic area subdivision used to bypass result limits.

## Features

- **Automatic Subdivision**: Splits large search areas into smaller 500m radius sub-circles to maximize results, overcoming the 20-result (New API) or 60-result (Legacy API) limit per query.
- **Support for New & Legacy APIs**: Choose between the latest **Places API (New)** (v1) or the **Legacy Maps API** (Nearby Search).
- **Fluent API**: Easy-to-use chainable methods for configuration.
- **Rate Limiting**: Handles API pagination and rate limiting automatically.
- **Filtering**: By default, filters out temporarily closed places (configurable).
- **Flexible Output**: Export to JSON, CSV, or handle results with a custom callback.

## Installation

```bash
npm install easy-google-places
# or
bun add easy-google-places
# or
yarn add easy-google-places
```

## Usage

### 1. New Google Places API (Recommended, but you need to enable the new API in the Google Cloud Console)

Uses `places.googleapis.com/v1` and supports Field Constraints (billing efficiency).

```typescript
import { getGooglePlaces, PlaceResult } from "easy-google-places";

const location = { latitude: 48.8566, longitude: 2.3522 };

await getGooglePlaces(location)
  .radius(2000) // Search within 2km radius
  .placesTypes(["restaurant"]) 
  .fields(["displayName", "rating", "formattedAddress", "id"]) // Specify fields!
  .apiKey("YOUR_GOOGLE_MAPS_API_KEY") 
  .showLogs() 
  .onFinished((places) => {
      console.log(`Found ${places.length} places.`);
      // Result is 'PlaceResult' (camelCase)
      places.forEach(p => console.log(p.displayName?.text));
  })
  .run();
```

### 2. Legacy Maps API (Original Behavior)

Uses `maps.googleapis.com/.../nearbysearch` and returns the classic snake_case response.

```typescript
import { getLegacyGooglePlaces, MapsPlaceResult } from "easy-google-places";

const location = { latitude: 48.8566, longitude: 2.3522 };

await getLegacyGooglePlaces(location)
  .radius(2000)
  .placesTypes(["restaurant"])
  .apiKey("YOUR_GOOGLE_MAPS_API_KEY")
  .showLogs()
  .onFinished((places) => {
      console.log(`Found ${places.length} places.`);
      // Result is 'MapsPlaceResult' (snake_case)
      places.forEach(p => console.log(p.name));
  })
  .run();
```

## Including Temporarily Closed Stores
By default, the library filters out places with `business_status: "CLOSED_TEMPORARILY"`. To include them:

```typescript
await getGooglePlaces(location)
  .allowClosedStores() 
  .run();
```

## Output Formats

### CSV Output
Using `.onFinished("csv")` will generate a CSV file (`places_output.csv` for New API or `maps_places_output.csv` for Legacy API).

### JSON Output
Using `.onFinished("json")` will generate a JSON file (`places_output.json` for New API or `maps_places_output.json` for Legacy API).

## Debug Circle Visualization (HTML)

You can generate an HTML preview of the main circle + generated sub-circles:

```bash
npm run mock:circles
# or with custom values:
npm run mock:circles -- --lat=43.6591 --lng=-70.2568 --radius=2000 --subRadius=500 --out=debug_circles.html
```

It writes an HTML file (default: `circles_preview.html`) that you can open in a browser.

You can also call it programmatically:

```typescript
import { generateCirclesHtml } from "easy-google-places";

generateCirclesHtml({
  center: { latitude: 43.6591, longitude: -70.2568 },
  radius: 2000,
  subRadius: 500,
  outputPath: "debug_circles.html",
});
```

## Requirements
- Node.js or Bun environment.
- A valid Google Cloud API Key with:
  - **"Places API (New)"** enabled for `getGooglePlaces`.
  - **"Places API"** enabled for `getLegacyGooglePlaces`.

## License
MIT

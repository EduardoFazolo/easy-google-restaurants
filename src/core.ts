import { generateSubCircles, haversineDistanceMeters } from "./geometry";
import { fetchLegacyPlaces, fetchNewPlaces } from "./api";
import { writeFileSync } from "fs";
import { Coordinate, MapsPlaceResult, NearbySearchAttributes, PlaceResult } from "./types";

type OutputFormat = "csv" | "json" | ((places: MapsPlaceResult[]) => void);
type NewOutputFormat = "csv" | "json" | ((places: PlaceResult[]) => void);

function isWithinRequestedRadius(origin: Coordinate, point: Coordinate, radius: number): boolean {
  return haversineDistanceMeters(origin, point) <= radius;
}

function getLegacyPlaceCoordinate(place: MapsPlaceResult): Coordinate | null {
  const location = place.geometry?.location;
  if (!location) return null;

  const latitude = typeof location.lat === "function" ? location.lat() : location.lat;
  const longitude = typeof location.lng === "function" ? location.lng() : location.lng;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function getNewPlaceCoordinate(place: PlaceResult): Coordinate | null {
  const location = place.location;
  if (!location) return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return { latitude: location.latitude, longitude: location.longitude };
}

/**
 * Legacy Query Builder using the original Maps API (Nearby Search).
 */
export class PlaceQueryBuilder {
  private _location: Coordinate;
  private _radius: number = 4000; // Default 4km
  private _subRadius: number = 500; // Default 500m
  private _minRate: number = 4.1;
  private _limitCount: number | undefined;
   /**
   * The types of places to search for.
   * See [the API documentation](https://developers.google.com/maps/documentation/places/web-service/place-types#table-a)
   * @example ["bar", "pub", "restaurant", "cafe"]
   */
  private _types: string[] = [];
  private _onFinished?: OutputFormat;
  private _showLogs: boolean = false;
  private _showProgress: boolean = false;
  private _apiKey: string | undefined;

  private _forceQueryClosedStores: boolean = false;
  private _excludedPrimaryTypes: string[] = [];

  constructor(location: Coordinate) {
    this._location = location;
    // Try to load API Key from env if available (Bun loads .env automatically)
    this._apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  }

  public placesTypes(types: string[]): this {
    this._types = types;
    return this;
  }

  public radius(radius: number): this {
    this._radius = radius;
    return this;
  }

  public minRate(rate: number): this {
    this._minRate = rate;
    return this;
  }

  public limit(max: number): this {
    this._limitCount = max;
    return this;
  }

  public apiKey(key: string): this {
    this._apiKey = key;
    return this;
  }

  public onFinished(format: OutputFormat): this {
    this._onFinished = format;
    return this;
  }

  public showLogs(): this {
    this._showLogs = true;
    return this;
  }

  public showProgress(): this {
    this._showProgress = true;
    return this;
  }

  public allowClosedStores(): this {
    this._forceQueryClosedStores = true;
    return this;
  }

  public excludedPrimaryTypes(types: string[]): this {
    this._excludedPrimaryTypes = types;
    return this;
  }

  public async run(): Promise<void> {
    if (!this._apiKey) {
      throw new Error("API Key is required. Set it via .apiKey() or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY env var.");
    }
    if (!this._onFinished) {
      throw new Error("onFinished callback or format is required.");
    }

    if (this._showLogs) console.log("Starting Google Places (Legacy) query...");

    // 1. Generate sub-circles
    let subCircles = generateSubCircles(this._location, this._radius, this._subRadius);
    
    // Optimization: If limit is set, reduce the number of batches
    if (this._limitCount) {
      const maxBatches = Math.ceil(this._limitCount / 60);
      if (subCircles.length > maxBatches) {
        // Shuffle array to get random circles
        for (let i = subCircles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [subCircles[i], subCircles[j]] = [subCircles[j], subCircles[i]];
        }
        // Slice to the max needed matches
        subCircles = subCircles.slice(0, maxBatches);
        if (this._showLogs) console.log(`Optimization: Limiting to ${maxBatches} batches based on limit of ${this._limitCount}`);
      }
    }

    const totalBatches = subCircles.length;
    const allPlacesMap = new Map<string, MapsPlaceResult>();
    let processedBatches = 0;
    
    for (const circle of subCircles) {
      if (this._showLogs) console.log(`Querying batch ${processedBatches + 1}/${totalBatches} at ${circle.latitude}, ${circle.longitude}...`);
      
      const places = await fetchLegacyPlaces(
        circle, 
        this._subRadius, 
        this._types, 
        this._apiKey,
        (count) => {},
        this._forceQueryClosedStores
      );

      for (const place of places) {
        if (place.place_id) {
          allPlacesMap.set(place.place_id, place);
        }
      }

      processedBatches++;
      
      if (this._showProgress) {
        const percentage = ((processedBatches / totalBatches) * 100).toFixed(1);
        console.log(`Progress: ${percentage}% (${processedBatches}/${totalBatches} batches)`);
      }

      await new Promise(r => setTimeout(r, 200)); 
      if(processedBatches % 20 === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let uniquePlaces = Array.from(allPlacesMap.values());

    const beforeRadiusFilter = uniquePlaces.length;
    uniquePlaces = uniquePlaces.filter((place) => {
      const placeCoordinate = getLegacyPlaceCoordinate(place);
      if (!placeCoordinate) return false;
      return isWithinRequestedRadius(this._location, placeCoordinate, this._radius);
    });
    if (this._showLogs && beforeRadiusFilter !== uniquePlaces.length) {
      console.log(`Filtered out ${beforeRadiusFilter - uniquePlaces.length} places outside requested radius.`);
    }
    
    // Filter by minRate
    uniquePlaces = uniquePlaces.filter(p => (p.rating || 0) >= this._minRate);

    // Filter by excludedPrimaryTypes (Client-side for Legacy API)
    if (this._excludedPrimaryTypes.length > 0) {
      uniquePlaces = uniquePlaces.filter(p => {
        if (!p.types) return true;
        // If any of the place's types are in the excluded list, filter it out.
        // Legacy API types are an array of strings.
        return !p.types.some(t => this._excludedPrimaryTypes.includes(t));
      });
      if (this._showLogs) console.log(`Filtered out places based on excluded types: ${this._excludedPrimaryTypes.join(", ")}`);
    }

    // Apply limit
    if (this._limitCount && uniquePlaces.length > this._limitCount) {
      uniquePlaces = uniquePlaces.slice(0, this._limitCount);
    }
    if (this._showLogs) console.log(`Finished! Found ${uniquePlaces.length} unique places.`);

    this.handleOutput(uniquePlaces);
  }

  private handleOutput(places: MapsPlaceResult[]) {
    if (typeof this._onFinished === "function") {
      this._onFinished(places);
    } else if (this._onFinished === "json") {
      const jsonContent = JSON.stringify(places, null, 2);
      writeFileSync("maps_places_output.json", jsonContent);
      if (this._showLogs) console.log("Saved results to maps_places_output.json");
    } else if (this._onFinished === "csv") {
        const headers = ["name", "address", "rating", "user_ratings_total", "place_id", "lat", "lng"];
        const csvContent = [
            headers.join(","),
            ...places.map(p => {
                return [
                    `"${(p.name || "").replace(/"/g, '""')}"`,
                    `"${(p.formatted_address || "").replace(/"/g, '""')}"`,
                    p.rating || "",
                    p.user_ratings_total || "",
                    p.place_id,
                    p.geometry?.location?.lat || "",
                    p.geometry?.location?.lng || ""
                ].join(",")
            })
        ].join("\n");
        writeFileSync("maps_places_output.csv", csvContent);
        if (this._showLogs) console.log("Saved results to maps_places_output.csv");
    }
  }
}

/**
 * New Places API Query Builder (v1).
 */
export class NewPlaceQueryBuilder {
  private _location: Coordinate;
  private _radius: number = 4000;
  private _subRadius: number = 500; 
  private _minRate: number = 4.1;
  private _limitCount: number | undefined;
  /**
   * The types of places to search for.
   * See [the API documentation](https://developers.google.com/maps/documentation/places/web-service/place-types#table-a)
   * @example ["bar", "pub", "restaurant", "cafe"]
   */
  private _types: string[] = [];
  private _fields: NearbySearchAttributes[] = ["name", "displayName", "id", "formattedAddress", "rating", "location", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri", "googleMapsUri", "regularOpeningHours", "reservable", "parkingOptions",  "priceLevel", "businessStatus", "utcOffsetMinutes", "userRatingCount", "types", "primaryType", "primaryTypeDisplayName"]; // Defaults
  private _onFinished?: NewOutputFormat;
  private _showLogs: boolean = false;
  private _showProgress: boolean = false;
  private _apiKey: string | undefined;

  private _forceQueryClosedStores: boolean = false;
  private _excludedPrimaryTypes: string[] = [];

  constructor(location: Coordinate) {
    this._location = location;
    this._apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  }

  public placesTypes(types: string[]): this {
    this._types = types;
    return this;
  }

  public radius(radius: number): this {
    this._radius = radius;
    return this;
  }

  public minRate(rate: number): this {
    this._minRate = rate;
    return this;
  }

  public limit(max: number): this {
    this._limitCount = max;
    return this;
  }

  public apiKey(key: string): this {
    this._apiKey = key;
    return this;
  }

  /**
   * Specifies fields to return from the New Places API.
   * e.g. ["displayName", "rating", "formattedAddress"]
   */
  public fields(fields: NearbySearchAttributes[]): this {
    this._fields = [...this._fields, ...fields];
    return this;
  }

  public onFinished(format: NewOutputFormat): this {
    this._onFinished = format;
    return this;
  }

  public showLogs(): this {
    this._showLogs = true;
    return this;
  }

  public showProgress(): this {
    this._showProgress = true;
    return this;
  }

  public allowClosedStores(): this {
    this._forceQueryClosedStores = true;
    return this;
  }

  /**
   * Some of the types includes `chinese_restaurant`, `japanese_restaurant`, `italian_restaurant`, etc.
   * 
   * You can see the types [here](https://developers.google.com/maps/documentation/places/web-service/place-types#table-a)
   * @param types 
   * @returns 
   */
  public excludedPrimaryTypes(types: string[]): this {
    this._excludedPrimaryTypes = types;
    return this;
  }

  public async run(): Promise<void> {
    if (!this._apiKey) {
      throw new Error("API Key is required.");
    }
    if (!this._onFinished) {
      throw new Error("onFinished callback or format is required.");
    }

    if (this._showLogs) console.log("Starting Google Places (New) query...");

    let subCircles = generateSubCircles(this._location, this._radius, this._subRadius);
    
    // Same optimization logic
    if (this._limitCount) {
      const maxBatches = Math.ceil(this._limitCount / 20); // Note: New API limit is 20 per call
      if (subCircles.length > maxBatches) {
        for (let i = subCircles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [subCircles[i], subCircles[j]] = [subCircles[j], subCircles[i]];
        }
        subCircles = subCircles.slice(0, maxBatches);
      }
    }

    const totalBatches = subCircles.length;
    const allPlacesMap = new Map<string, PlaceResult>();
    let processedBatches = 0;
    
    for (const circle of subCircles) {
      if (this._showLogs) console.log(`Querying batch ${processedBatches + 1}/${totalBatches}...`);
      
      const places = await fetchNewPlaces(
        circle, 
        this._subRadius, 
        this._types,
        this._apiKey,
        this._fields,
        (count) => {},
        this._forceQueryClosedStores,
        this._excludedPrimaryTypes
      );

      for (const place of places) {
        if (place.id) {
          allPlacesMap.set(place.id, place);
        }
      }

      processedBatches++;
      
      if (this._showProgress) {
        const percentage = ((processedBatches / totalBatches) * 100).toFixed(1);
        console.log(`Progress: ${percentage}%`);
      }

      await new Promise(r => setTimeout(r, 200)); 
      if(processedBatches % 20 === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let uniquePlaces = Array.from(allPlacesMap.values());

    const beforeRadiusFilter = uniquePlaces.length;
    uniquePlaces = uniquePlaces.filter((place) => {
      const placeCoordinate = getNewPlaceCoordinate(place);
      if (!placeCoordinate) return false;
      return isWithinRequestedRadius(this._location, placeCoordinate, this._radius);
    });
    if (this._showLogs && beforeRadiusFilter !== uniquePlaces.length) {
      console.log(`Filtered out ${beforeRadiusFilter - uniquePlaces.length} places outside requested radius.`);
    }

    uniquePlaces = uniquePlaces.filter(p => (p.rating || 0) >= this._minRate);

    if (this._limitCount && uniquePlaces.length > this._limitCount) {
      uniquePlaces = uniquePlaces.slice(0, this._limitCount);
    }
    if (this._showLogs) console.log(`Finished! Found ${uniquePlaces.length} unique places.`);

    this.handleOutput(uniquePlaces);
  }

  private handleOutput(places: PlaceResult[]) {
    if (typeof this._onFinished === "function") {
       this._onFinished(places);
    } else if (this._onFinished === "json") {
       const jsonContent = JSON.stringify(places, null, 2);
       writeFileSync("places_output.json", jsonContent);
       if (this._showLogs) console.log("Saved results to places_output.json");
    } else if (this._onFinished === "csv") {
        const headers = ["id", "rating", "formattedAddress", "displayName"];
        const csvContent = [
            headers.join(","),
            ...places.map(p => {
                return [
                  p.id,
                  p.rating || "",
                  `"${(p.formattedAddress || "").replace(/"/g, '""')}"`,
                  `"${(p.displayName?.text || p.name || "").replace(/"/g, '""')}"`
                ].join(",")
            })
        ].join("\n");
        writeFileSync("places_output.csv", csvContent);
        if (this._showLogs) console.log("Saved results to places_output.csv");
    }
  }
}

export function getLegacyGooglePlaces(location: Coordinate) {
  return new PlaceQueryBuilder(location);
}

export function getGooglePlaces(location: Coordinate) {
  return new NewPlaceQueryBuilder(location);
}

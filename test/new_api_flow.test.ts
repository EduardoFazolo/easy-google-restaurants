import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { getGooglePlaces } from "../src/index";

describe("NewPlaceQueryBuilder Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch before each test
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("runs new API flow with mocked responses", async () => {
    const mockResults = [
      { id: "np1", name: "places/np1", displayName: { text: "New Place 1", languageCode: "en" }, rating: 4.8, businessStatus: "OPERATIONAL", location: { latitude: 10.002, longitude: 10.001 } },
      { id: "np2", name: "places/np2", displayName: { text: "New Place 2", languageCode: "en" }, rating: 4.2, businessStatus: "OPERATIONAL", location: { latitude: 10.004, longitude: 10.004 } },
      { id: "np3", name: "places/np3", displayName: { text: "Too Far", languageCode: "en" }, rating: 4.9, businessStatus: "OPERATIONAL", location: { latitude: 10.04, longitude: 10.04 } }
    ];

    // Mock fetch
    global.fetch = mock(async (url) => {
      // Check if URL is correct
      if (url.toString().includes("places.googleapis.com/v1")) {
         return new Response(JSON.stringify({
             places: mockResults
         }));
      }
      return new Response(JSON.stringify({}));
    }) as unknown as typeof fetch;

    let finishedResults: any[] = [];
    
    await getGooglePlaces({ latitude: 10, longitude: 10 })
      .radius(1000)
      .apiKey("MOCK_KEY")
      .fields(["id", "displayName", "rating"])
      .onFinished((results) => {
        finishedResults = results;
      })
      .run();

    expect(finishedResults.length).toBeGreaterThan(0);
    expect(finishedResults).toHaveLength(2);
    expect(finishedResults[0].id).toBe("np1");
    // Check if fields are mapped correctly (although here strictly relying on mock result structure)
    expect(finishedResults[0].rating).toBe(4.8);
    expect(finishedResults.find((p: any) => p.id === "np3")).toBeUndefined();
  });
});

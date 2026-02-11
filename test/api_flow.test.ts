import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { getLegacyGooglePlaces } from "../src/index";

describe("PlaceQueryBuilder Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch before each test
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("runs full flow with mocked responses", async () => {
    const mockResults = [
      { place_id: "p1", name: "Place 1", rating: 4.5, business_status: "OPERATIONAL", geometry: { location: { lat: 10.002, lng: 10.001 } } },
      { place_id: "p2", name: "Place 2", rating: 4.5, business_status: "OPERATIONAL", geometry: { location: { lat: 10.006, lng: 10.004 } } },
      { place_id: "p3", name: "Place 3", rating: 4.5, business_status: "CLOSED_TEMPORARILY", geometry: { location: { lat: 10.003, lng: 10.002 } } },
      { place_id: "p4", name: "Out of Radius", rating: 4.7, business_status: "OPERATIONAL", geometry: { location: { lat: 10.03, lng: 10.03 } } }
    ];

    // Mock fetch
    global.fetch = mock(async (url) => {
      // Simulate successful response
      return new Response(JSON.stringify({
        status: "OK",
        results: mockResults,
        next_page_token: undefined // No pagination for this test to keep it simple
      }));
    }) as unknown as typeof fetch;

    let finishedResults: any[] = [];
    
    await getLegacyGooglePlaces({ latitude: 10, longitude: 10 })
      .radius(1000)
      .apiKey("MOCK_KEY")
      .onFinished((results) => {
        finishedResults = results;
      })
      .run();

    expect(finishedResults.length).toBeGreaterThan(0);
    // Since we generate multiple sub-circles, we might hit the API multiple times.
    // Our mock returns the same results for every call, so we'll get duplicates which are deduped by place_id.
    expect(finishedResults).toHaveLength(2);
    expect(finishedResults[0].place_id).toBe("p1");
    expect(finishedResults.find((p: any) => p.place_id === "p4")).toBeUndefined();
  });

  test("throws error if API key missing", async () => {
    const builder = getLegacyGooglePlaces({ latitude: 0, longitude: 0 })
        .onFinished("json"); // No API key set
    
    // We intentionally don't set env var here (assuming it's not set in test env, or we can clear it)
    const oldEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Use a wrapper to catch the async error
    let error;
    try {
        await builder.run();
    } catch (e) {
        error = e;
    }
    expect(error).toBeDefined();

    // Restore env
    if (oldEnv) process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = oldEnv;
  });
});

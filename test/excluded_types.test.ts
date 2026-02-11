import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { getLegacyGooglePlaces, getGooglePlaces } from "../src/index";

describe("Excluded Types Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch before each test
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("Legacy API: Filters out excluded types client-side", async () => {
    const mockResults = [
        { place_id: "p1", name: "Place 1", types: ["restaurant", "food"], rating: 4.5, geometry: { location: { lat: 10.001, lng: 10.001 } } },
        { place_id: "p2", name: "Place 2", types: ["bar", "point_of_interest"], rating: 4.5, geometry: { location: { lat: 10.002, lng: 10.002 } } },
        { place_id: "p3", name: "Place 3", types: ["cafe", "food"], rating: 4.5, geometry: { location: { lat: 10.003, lng: 10.003 } } }
    ];

    global.fetch = mock(async () => {
      return new Response(JSON.stringify({
        status: "OK",
        results: mockResults
      }));
    }) as unknown as typeof fetch;

    let finishedResults: any[] =[];

    await getLegacyGooglePlaces({ latitude: 10, longitude: 10 })
      .radius(1000)
      .apiKey("MOCK_KEY")
      .excludedPrimaryTypes(["bar"])
      .onFinished((results) => {
        finishedResults = results;
      })
      .run();

    expect(finishedResults).toHaveLength(2); // p1 and p3
    expect(finishedResults.find((p: any) => p.place_id === "p2")).toBeUndefined();
  });

  test("New API: Sends excludedPrimaryTypes in request body", async () => {
    let capturedBody: any = null;

    global.fetch = mock(async (url, options) => {
      capturedBody = JSON.parse(options?.body as string);
      return new Response(JSON.stringify({
        places: []
      }));
    }) as unknown as typeof fetch;

    await getGooglePlaces({ latitude: 10, longitude: 10 })
      .radius(1000)
      .apiKey("MOCK_KEY")
      .fields(["name"])
      .excludedPrimaryTypes(["bar", "park"])
      .onFinished(() => {})
      .run();

    expect(capturedBody).toBeDefined();
    expect(capturedBody.excludedPrimaryTypes).toEqual(["bar", "park"]);
  });
});

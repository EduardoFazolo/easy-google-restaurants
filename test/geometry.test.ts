import { describe, expect, test } from "bun:test";
import { generateSubCircles, haversineDistanceMeters } from "../src/geometry";
import { Coordinate } from "../src/types";

describe("generateSubCircles", () => {
  test("returns single center if radius <= subRadius", () => {
    const center: Coordinate = { latitude: 0, longitude: 0 };
    const circles = generateSubCircles(center, 400, 500);
    expect(circles).toHaveLength(1);
    expect(circles[0]).toEqual(center);
  });

  test("returns multiple circles for larger radius", () => {
    const center: Coordinate = { latitude: 0, longitude: 0 };
    const circles = generateSubCircles(center, 1500, 500);
    
    // We expect multiple circles. 
    // Exact count depends on the packing algorithm, but should be > 1.
    expect(circles.length).toBeGreaterThan(1);
    
    // Check if points are roughly within range
    // At lat=0, 1 degree ~ 111km. 1500m is ~0.0135 degrees.
    for (const circle of circles) {
        expect(Math.abs(circle.latitude)).toBeLessThan(0.1);
        expect(Math.abs(circle.longitude)).toBeLessThan(0.1);
    }
  });

  test("generates sensible coordinates", () => {
      const center: Coordinate = { latitude: 40.7128, longitude: -74.0060 }; // NYC
      const circles = generateSubCircles(center, 1000, 500);
      expect(circles.length).toBeGreaterThan(1);
      // Ensure they aren't all the same
      const first = circles[0];
      const hasDifferent = circles.some(c => c.latitude !== first.latitude || c.longitude !== first.longitude);
      expect(hasDifferent).toBe(true);
  });

  test("keeps sub-circle centers within the requested radius", () => {
    const center: Coordinate = { latitude: 43.6591, longitude: -70.2568 }; // Portland, ME
    const radius = 1200;
    const circles = generateSubCircles(center, radius, 500);

    for (const circle of circles) {
      const distance = haversineDistanceMeters(center, circle);
      expect(distance).toBeLessThanOrEqual(radius + 0.01);
    }
  });
});

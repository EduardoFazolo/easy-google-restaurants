import { writeFileSync } from "fs";
import { generateSubCircles } from "./geometry";
import { Coordinate } from "./types";

export interface GenerateCirclesHtmlOptions {
  center: Coordinate;
  radius: number;
  subRadius?: number;
  outputPath?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface GenerateCirclesHtmlResult {
  outputPath: string;
  subCircleCount: number;
}

/**
 * Generates an HTML file that draws the main radius and all generated sub-circles.
 */
export function generateCirclesHtml(
  options: GenerateCirclesHtmlOptions
): GenerateCirclesHtmlResult {
  const {
    center,
    radius,
    subRadius = 500,
    outputPath = "circles_preview.html",
    title = "Generated Search Circles",
    width = 980,
    height = 980,
  } = options;

  if (radius <= 0) throw new Error("radius must be greater than 0.");
  if (subRadius <= 0) throw new Error("subRadius must be greater than 0.");

  const subCircles = generateSubCircles(center, radius, subRadius);

  // Local meter projection around center for drawing
  const latRad = (center.latitude * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(latRad);

  const toMeters = (point: Coordinate) => ({
    x: (point.longitude - center.longitude) * metersPerDegLon,
    y: (point.latitude - center.latitude) * metersPerDegLat,
  });

  const projected = subCircles.map((point) => toMeters(point));
  const extent = radius + subRadius;
  const padding = 32;
  const drawable = Math.min(width, height) - padding * 2;
  const scale = drawable / (extent * 2);

  const originX = width / 2;
  const originY = height / 2;

  const mapX = (metersX: number) => originX + metersX * scale;
  const mapY = (metersY: number) => originY - metersY * scale;

  const subCirclesSvg = projected
    .map((point) => {
      const cx = mapX(point.x).toFixed(2);
      const cy = mapY(point.y).toFixed(2);
      const r = (subRadius * scale).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" class="sub-circle" />`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f4f7fb;
        --card: #ffffff;
        --text: #112032;
        --muted: #4f6378;
        --main: #2a6ad8;
        --main-fill: rgba(42, 106, 216, 0.08);
        --sub: #e55252;
        --sub-fill: rgba(229, 82, 82, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top left, #e8f1ff 0%, var(--bg) 55%);
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
      }
      .card {
        width: min(1100px, 95vw);
        background: var(--card);
        border-radius: 18px;
        box-shadow: 0 14px 40px rgba(17, 32, 50, 0.12);
        padding: 20px;
      }
      .title {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
      }
      .meta {
        margin-top: 6px;
        color: var(--muted);
        font-size: 14px;
      }
      svg {
        width: 100%;
        height: auto;
        border-radius: 14px;
        background:
          linear-gradient(rgba(17, 32, 50, 0.04) 1px, transparent 1px) 0 0 / 30px 30px,
          linear-gradient(90deg, rgba(17, 32, 50, 0.04) 1px, transparent 1px) 0 0 / 30px 30px,
          #fbfdff;
        margin-top: 16px;
        border: 1px solid #dce6f2;
      }
      .main-circle {
        fill: var(--main-fill);
        stroke: var(--main);
        stroke-width: 2;
      }
      .sub-circle {
        fill: var(--sub-fill);
        stroke: var(--sub);
        stroke-width: 1.2;
      }
      .center-dot {
        fill: #0c2f77;
      }
    </style>
  </head>
  <body>
    <section class="card">
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="meta">
        Center: (${center.latitude}, ${center.longitude}) |
        Main radius: ${radius}m |
        Sub radius: ${subRadius}m |
        Generated circles: ${subCircles.length}
      </p>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Circle visualization">
        <circle cx="${originX}" cy="${originY}" r="${(radius * scale).toFixed(2)}" class="main-circle" />
        ${subCirclesSvg}
        <circle cx="${originX}" cy="${originY}" r="4" class="center-dot" />
      </svg>
    </section>
  </body>
</html>`;

  writeFileSync(outputPath, html, "utf8");

  return {
    outputPath,
    subCircleCount: subCircles.length,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

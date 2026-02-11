import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateCirclesHtml } from "../src/mock";

describe("generateCirclesHtml", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("writes an HTML file with svg circles", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "egp-circles-"));
    tempDirs.push(tempDir);
    const outputPath = join(tempDir, "preview.html");

    const result = generateCirclesHtml({
      center: { latitude: 43.6591, longitude: -70.2568 },
      radius: 1500,
      subRadius: 500,
      outputPath,
    });

    expect(result.outputPath).toBe(outputPath);
    expect(result.subCircleCount).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);

    const content = readFileSync(outputPath, "utf8");
    expect(content.includes("<svg")).toBe(true);
    expect(content.includes("class=\"main-circle\"")).toBe(true);
    expect(content.includes("class=\"sub-circle\"")).toBe(true);
  });
});

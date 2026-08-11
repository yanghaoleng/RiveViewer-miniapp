import assert from "node:assert/strict";
import test from "node:test";
import { backingPointToArtboard, canvasPointToBacking } from "../lib/canvas-space.ts";

test("maps CSS pointer coordinates into the high-DPI backing canvas", () => {
  assert.deepEqual(
    canvasPointToBacking(120, 80, 360, 240, 720, 480),
    { x: 240, y: 160 },
  );
});

test("inverts the Rive alignment matrix into artboard coordinates", () => {
  assert.deepEqual(
    backingPointToArtboard({ xx: 2, xy: 0, yx: 0, yy: 2, tx: 40, ty: 20 }, 240, 160),
    { x: 100, y: 70 },
  );
});

test("ignores a non-invertible alignment matrix", () => {
  assert.equal(
    backingPointToArtboard({ xx: 0, xy: 0, yx: 0, yy: 0, tx: 0, ty: 0 }, 10, 10),
    null,
  );
});

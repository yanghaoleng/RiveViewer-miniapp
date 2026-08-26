import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsErrorCategory,
  analyticsFileSizeBucket,
  analyticsSurfaceFromBase,
} from "../lib/analytics.ts";

test("maps all three H5 builds onto one analytics surface model", () => {
  assert.equal(analyticsSurfaceFromBase("/rive-viewer/"), "generic");
  assert.equal(analyticsSurfaceFromBase("/"), "jojo");
  assert.equal(analyticsSurfaceFromBase("/beta/"), "beta");
});

test("uses stable non-overlapping file size buckets", () => {
  const mib = 1024 * 1024;
  assert.equal(analyticsFileSizeBucket(mib - 1), "under_1m");
  assert.equal(analyticsFileSizeBucket(mib), "1m_5m");
  assert.equal(analyticsFileSizeBucket(5 * mib), "5m_10m");
  assert.equal(analyticsFileSizeBucket(10 * mib), "10m_30m");
  assert.equal(analyticsFileSizeBucket(30 * mib), "30m_64m");
});

test("reduces client errors to bounded diagnostic categories", () => {
  assert.equal(analyticsErrorCategory({ code: "file_too_large", status: 413 }), "too_large");
  assert.equal(analyticsErrorCategory({ code: "download_network_error" }), "network");
  assert.equal(analyticsErrorCategory(new Error("WebGL 渲染失败")), "renderer");
  assert.equal(analyticsErrorCategory({ status: 503 }), "server");
});

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function request(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the standalone Rive viewer", async () => {
  const response = await request("/rive-viewer");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Rive 预览台 H5<\/title>/i);
  assert.match(html, /导入 Rive 文件/);
  assert.match(html, /引导页动画750_1160\.riv/);
  assert.match(html, /题目动画_1\.riv/);
});

test("root redirects to the stable viewer path", async () => {
  const response = await request("/");
  assert.ok([307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/rive-viewer");
});

test("ships the browser runtime and local-only library", async () => {
  const [wasm, guide, question, miniProgramCode, librarySource] = await Promise.all([
    readFile(new URL("../public/rive-viewer/rive.wasm", import.meta.url)),
    readFile(new URL("../public/rive-viewer/samples/guide.riv", import.meta.url)),
    readFile(new URL("../public/rive-viewer/samples/question.riv", import.meta.url)),
    readFile(new URL("../public/rive-viewer/mini-program-code.webp", import.meta.url)),
    readFile(new URL("../lib/library.ts", import.meta.url), "utf8"),
  ]);

  assert.ok(wasm.byteLength > 1_000_000);
  assert.equal(guide.subarray(0, 4).toString("ascii"), "RIVE");
  assert.equal(question.subarray(0, 4).toString("ascii"), "RIVE");
  assert.ok(miniProgramCode.byteLength < 50_000);
  assert.match(librarySource, /indexedDB/);
  assert.doesNotMatch(librarySource, /fetch\(["'`]https?:|fetch\(["'`]\/api|XMLHttpRequest|FormData/);
  await access(new URL("../app/rive-viewer/RiveViewerApp.tsx", import.meta.url));
});

test("keeps preview controls on one page and aligns pointer coordinates with rendering", async () => {
  const [appSource, playerSource, librarySource, styleSource] = await Promise.all([
    readFile(new URL("../app/rive-viewer/RiveViewerApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/rive-player.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(appSource, /activeTab|primary-tabs/);
  assert.match(appSource, /label="状态机输入"/);
  assert.match(appSource, /label="缩放方式"/);
  assert.ok(appSource.indexOf('label="预览背景"') < appSource.indexOf('label="渲染质量"'));
  assert.doesNotMatch(appSource, /label="文件操作"|继续导入|下载文件/);
  assert.match(appSource, /className="topbar-download"/);
  assert.match(appSource, /className="file-heading-download press-feedback"/);
  assert.match(appSource, /fit === "contain" && hasStageAspect/);
  assert.match(styleSource, /\.canvas-card\.is-proportional\s*\{[\s\S]{0,120}height:\s*auto;[\s\S]{0,80}min-height:\s*0/);
  assert.match(styleSource, /\.file-row:hover,[\s\S]{0,120}\.file-row\.is-menu-open\s*\{[\s\S]{0,100}background:/);
  assert.match(appSource, /<MiniProgramEntry \/>/);
  assert.match(appSource, /mini-program-code\.webp/);
  const iconElements = appSource.match(/<[A-Z][A-Za-z0-9]*\s+[^>]*\bsize=\{[^}]+\}[^>]*>/g) ?? [];
  assert.ok(iconElements.length >= 20);
  assert.ok(iconElements.every((element) => /\bweight="bold"/.test(element)));
  assert.doesNotMatch(appSource, /weight="(?:fill|regular|light|thin|duotone)"/);
  assert.match(styleSource, /\.mini-program-entry:hover \.mini-program-popover,[\s\S]{0,180}opacity:\s*1/);
  assert.match(appSource, /stageResizeTapOpen/);
  assert.match(appSource, /stageResizePressActive/);
  assert.match(appSource, /className="stage-resizer-modes"/);
  assert.match(appSource, /ShareNetwork[\s\S]{0,120}发送文件/);
  assert.doesNotMatch(appSource, /不能删除/);
  assert.match(librarySource, /getVisibleBuiltinFiles/);
  assert.match(librarySource, /hideBuiltinFile/);
  assert.match(styleSource, /\.transport\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(5/);
  assert.match(styleSource, /\.transport-playback\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(2/);
  assert.match(styleSource, /\.transport-files\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(2/);
  assert.match(appSource, /className="timeline-tag"/);
  assert.match(styleSource, /\.parameter-tag\.timeline-tag\s*\{[\s\S]{0,100}padding-right:\s*25px;[\s\S]{0,60}padding-left:\s*25px/);
  assert.match(styleSource, /\.parameter-tag\.is-playing\s*\{[\s\S]{0,80}color:\s*#f2f0e8;[\s\S]{0,180}var\(--timeline-progress\)/);
  assert.match(styleSource, /\.tone-button\s*\{[\s\S]{0,100}width:\s*45px;[\s\S]{0,80}height:\s*30px/);
  assert.match(styleSource, /\.press-feedback:active/);
  assert.match(playerSource, /this\.renderer\.align\(/);
  assert.match(playerSource, /canvasPointToBacking/);
  assert.match(playerSource, /backingPointToArtboard/);
  assert.doesNotMatch(playerSource, /this\.renderer\.transform\(this\.viewMatrix\)/);
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  hostedSharePath,
  shareCodeFromPath,
  viewerHomePath,
} from "../lib/viewer-route.ts";
import { createHostedComment, getHostedFile, HostedApiError } from "../lib/hosted-api.ts";
import { mergeRecentHostedRecords } from "../lib/library.ts";
import { mergeUnifiedFiles } from "../lib/unified-library.ts";

function share(
  code: string,
  filename: string,
  createdAt: string,
  status: "active" | "archived" = "active",
) {
  return {
    code,
    filename,
    size: 24,
    sha256: "0".repeat(64),
    etag: `"${code}"`,
    isExample: false,
    status,
    createdAt,
    archivedAt: status === "archived" ? createdAt : null,
    commentCount: 0,
  };
}

test("recognizes public share routes at both deployment bases", () => {
  assert.equal(shareCodeFromPath("/A1b", "/"), "A1b");
  assert.equal(shareCodeFromPath("/7XZ/", "/"), "7XZ");
  assert.equal(shareCodeFromPath("/s/A1b", "/"), "A1b");
  assert.equal(shareCodeFromPath("/rive-viewer/7XZ", "/rive-viewer/"), "7XZ");
  assert.equal(shareCodeFromPath("/rive-viewer/s/7XZ", "/rive-viewer/"), "7XZ");
  assert.equal(shareCodeFromPath("/s/too-long", "/"), null);
  assert.equal(shareCodeFromPath("/api", "/"), null);
  assert.equal(shareCodeFromPath("/API", "/"), null);
  assert.equal(shareCodeFromPath("/rive-viewer/", "/rive-viewer/"), null);
  assert.equal(hostedSharePath("A1b"), "/A1b");
  assert.throws(() => hostedSharePath("api"), /保留码/);
  assert.throws(() => hostedSharePath("A 1"), /三位 Base62/);
  assert.equal(viewerHomePath("rive-viewer"), "/rive-viewer/");
});

test("keeps recently viewed hosted files deduplicated, ordered, and bounded", () => {
  const existing = [
    { id: "hosted-Ab1", hostedCode: "Ab1", name: "旧名称.riv", size: 10, updatedAt: 10 },
    { id: "hosted-XyZ", hostedCode: "XyZ", name: "另一个.riv", size: 12, updatedAt: 20 },
  ];
  const updated = mergeRecentHostedRecords(
    existing,
    { code: "Ab1", filename: "新名称.riv", size: 14 },
    30,
  );
  assert.equal(updated.length, 2);
  assert.deepEqual(updated.map((item) => item.hostedCode), ["Ab1", "XyZ"]);
  assert.equal(updated[0].name, "新名称.riv");
  assert.equal(updated[0].updatedAt, 30);

  const preserved = mergeRecentHostedRecords(
    updated,
    { code: "XyZ", filename: "更新名称.riv", size: 18 },
    50,
    20,
    true,
  );
  assert.deepEqual(preserved.map((item) => item.hostedCode), ["Ab1", "XyZ"]);
  assert.equal(preserved[1].name, "更新名称.riv");
  assert.equal(preserved[1].updatedAt, 20);

  const bounded = mergeRecentHostedRecords(
    updated,
    { code: "Q2w", filename: "第三个.riv", size: 16 },
    40,
    2,
  );
  assert.deepEqual(bounded.map((item) => item.hostedCode), ["Q2w", "Ab1"]);
});

test("merges local, recent, and active hosted files into one activity-sorted list", () => {
  const local = { id: "local-one", name: "同名.riv", size: 24, updatedAt: 200 };
  const recent = {
    id: "hosted-Ab1",
    hostedCode: "Ab1",
    name: "同名.riv",
    size: 24,
    updatedAt: 300,
  };
  const otherRecent = {
    id: "hosted-Xy2",
    hostedCode: "Xy2",
    name: "同名.riv",
    size: 24,
    updatedAt: 100,
  };
  const items = mergeUnifiedFiles(
    [local, recent, otherRecent],
    [
      share("Ab1", "同名.riv", "1970-01-01T00:00:00.150Z"),
      share("Xy2", "同名.riv", "1970-01-01T00:00:00.100Z"),
    ],
    [],
    { "local-one": "Ab1" },
  );

  assert.deepEqual(items.map((item) => item.hostedCode), ["Ab1", "Xy2"]);
  assert.equal(items[0].localFile?.id, "local-one");
  assert.equal(items[0].activityAt, 300);
  assert.equal(items[1].file.name, "同名.riv");
});

test("keeps a known published code ready during refresh and removes archived shares from active rows", () => {
  const local = { id: "local-one", name: "local.riv", size: 24, updatedAt: 200 };
  const publishedWithoutFreshList = mergeUnifiedFiles([local], [], [], { "local-one": "A1b" });
  assert.equal(publishedWithoutFreshList[0].hostedCode, "A1b");

  const archived = share("A1b", "local.riv", "2026-08-22T00:00:00.000Z", "archived");
  const afterArchive = mergeUnifiedFiles(
    [local, { id: "hosted-A1b", hostedCode: "A1b", name: "local.riv", size: 24, updatedAt: 300 }],
    [],
    [archived],
    { "local-one": "A1b" },
  );
  assert.equal(afterArchive.length, 1);
  assert.equal(afterArchive[0].localFile?.id, "local-one");
  assert.equal(afterArchive[0].hostedCode, undefined);
});

test("streams hosted file bytes with honest download progress", async () => {
  const originalFetch = globalThis.fetch;
  const progress: number[] = [];
  try {
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    }), { headers: { "Content-Length": "4" } });

    const data = await getHostedFile("A1b", {
      expectedBytes: 4,
      onProgress: (percent) => progress.push(percent),
    });
    assert.deepEqual(Array.from(new Uint8Array(data)), [1, 2, 3, 4]);
    assert.deepEqual(progress, [0, 50, 99, 100]);

    globalThis.fetch = async () => new Response(new Uint8Array([1, 2]), {
      headers: { "Content-Length": "2" },
    });
    await assert.rejects(
      getHostedFile("A1b", { expectedBytes: 4 }),
      (error) => error instanceof HostedApiError && error.code === "download_incomplete",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("submits comments with a stable browser visitor identity", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  try {
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        item: {
          id: "comment-1",
          nickname: "松果松鼠",
          avatar: "pinecone-squirrel",
          body: "按钮可以再大一点，杨皓棱",
          createdAt: "2026-08-24T04:00:00.000Z",
          status: "active",
          archivedAt: null,
        },
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const comment = await createHostedComment("A1b", {
      visitorId: "visitor-stable-forest-0001",
      body: "按钮可以再大一点，杨皓棱",
    });

    assert.equal(requestUrl, "/api/v1/shares/A1b/comments");
    assert.equal(requestInit?.method, "POST");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      visitorId: "visitor-stable-forest-0001",
      body: "按钮可以再大一点，杨皓棱",
    });
    assert.equal(comment.nickname, "松果松鼠");
    assert.equal(comment.avatar, "pinecone-squirrel");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps hosted API and file upload contracts explicit", async () => {
  const [apiSource, appSource, mainSource, panelSource, styleSource, clipboardSource, identitySource] = await Promise.all([
    readFile(new URL("../lib/hosted-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/rive-viewer/RiveViewerApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../static/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/rive-viewer/HostedPanels.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/clipboard.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/comment-identity.ts", import.meta.url), "utf8"),
  ]);

  assert.match(apiSource, /const API_ROOT = "\/api\/v1"/);
  assert.match(apiSource, /setRequestHeader\("X-Rive-Filename", encodeURIComponent\(filename\)\)/);
  assert.doesNotMatch(apiSource, /X-Rive-Example/);
  assert.match(apiSource, /request\.send\(data\)/);
  assert.match(apiSource, /new XMLHttpRequest\(\)/);
  assert.match(apiSource, /request\.upload\.onprogress/);
  assert.match(apiSource, /request\.timeout = 120_000/);
  assert.match(apiSource, /RESPONSE_TIMEOUT_MS = 20_000/);
  assert.match(apiSource, /DOWNLOAD_STALL_TIMEOUT_MS = 30_000/);
  assert.match(apiSource, /response\.body\.getReader\(\)/);
  assert.match(apiSource, /download_incomplete/);
  assert.match(apiSource, /\/shares\?status=/);
  assert.match(apiSource, /\/comments/);
  assert.match(apiSource, /updateHostedCommentStatus/);
  assert.match(apiSource, /"archive" \| "restore"/);
  assert.match(apiSource, /"X-Rive-Action": action/);
  assert.match(appSource, /PUBLISHED_CODES_STORAGE_KEY/);
  assert.doesNotMatch(appSource, /PublishConfirmDialog/);
  assert.match(appSource, /getHostedFile\(share\.code/);
  assert.match(appSource, /expectedBytes: share\.size/);
  assert.match(appSource, /onProgress: \(progress\)/);
  assert.match(appSource, /setPublicShareState\("ready"\);[\s\S]{0,100}if \(!share\.isExample\)/);
  assert.match(appSource, /if \(!shareCode \|\| publicShare\?\.status !== "active"\) return/);
  assert.match(appSource, /visitorId: getCommentVisitorId\(\)/);
  assert.match(appSource, /archiveHostedComment\(targetCode, comment\.id\)/);
  assert.match(appSource, /restoreHostedComment\(targetCode, comment\.id\)/);
  assert.match(appSource, /hostedShare: share/);
  assert.match(appSource, /rememberRecentHostedFile\(/);
  assert.match(appSource, /if \(!share\.isExample\)/);
  assert.match(appSource, /aria-label="返回文件列表"/);
  assert.match(appSource, /document\.querySelector\('\[aria-modal="true"\]'\)/);
  assert.match(appSource, /onDragEnter=\{enterDropTarget\}/);
  assert.match(appSource, /onDrop=\{dropFiles\}/);
  assert.match(appSource, /<PreviewFileRail/);
  assert.match(appSource, /<FileUploadDetail/);
  assert.match(appSource, /Record<string, FileUploadState>/);
  assert.doesNotMatch(appSource, /<CloudUploadStatusBar/);
  assert.match(appSource, /phase: "uploading"/);
  assert.match(appSource, /openPromise = openFile\(savedFile\)/);
  assert.match(appSource, /Promise\.all\(\[openPromise, refreshLibrary\(\), uploadPromise\]\)/);
  assert.match(appSource, /window\.history\.replaceState/);
  assert.match(appSource, /拖入或点击选择，上传后自动生成公开链接/);
  assert.match(appSource, /const activeHostedCode = isHostedPlatform && activeFile/);
  assert.match(appSource, /activeFile\.hostedShare\?\.code/);
  assert.match(appSource, /uploadStates\[activeFile\.file\.id\]\?\.share\?\.code/);
  assert.match(appSource, /publishedCodes\[activeFile\.file\.id\]/);
  assert.match(appSource, /type ActivityPolicy = "record" \| "preserve"/);
  assert.match(appSource, /RAIL_ACTIVITY_STATE_KEY = "riveRailPreserveActivity"/);
  assert.match(appSource, /openUnifiedFile\(item, "preserve"\)/);
  assert.match(appSource, /openUnifiedFile\(next, "preserve"\)/);
  assert.match(appSource, /type CommentThreadState = \{[\s\S]{0,120}code: string \| null;[\s\S]{0,120}items: HostedComment\[\]/);
  assert.match(appSource, /if \(isHostedPlatform && item\.hostedCode\) \{[\s\S]{0,120}navigateHostedShare\(item\.hostedCode, activityPolicy\)/);
  assert.match(appSource, /if \(current\.code !== targetCode\) return current/);
  assert.equal((appSource.match(/"复制当前文件链接"/g) || []).length, 4);
  assert.match(appSource, /copyActiveHostedLink/);
  assert.match(appSource, /copyText\(hostedShareUrl\(code\)\)/);
  assert.match(appSource, /detailCopyFeedback/);
  assert.match(appSource, /detailCopyIcon/);
  assert.match(appSource, /"check"/);
  assert.match(appSource, /"已复制"/);
  assert.match(appSource, /isHostedPlatform \? "contain" : "cover"/);
  assert.match(appSource, /className="topbar-action-label">下载/);
  assert.doesNotMatch(appSource, /detailShareCode/);
  assert.equal((appSource.match(/<ShareActionsDialog/g) || []).length, 1);
  assert.match(appSource, /className="brand-signature">for JOJO/);
  assert.match(appSource, /反馈意见：杨皓棱/);
  assert.doesNotMatch(appSource, /AUTHOR_WECHAT|联系作者反馈意见/);
  assert.match(appSource, /className="archived-library-trigger press-feedback"/);
  assert.match(appSource, /className="archived-library-count"/);
  assert.match(appSource, /aria-controls="archived-library-dialog"/);
  assert.match(appSource, /<ArchivedLibraryDialog/);
  assert.doesNotMatch(appSource, /<ArchivedLibrarySection/);
  assert.match(mainSource, /const mode = import\.meta\.env\.BASE_URL === "\/" \? "hosted" : "local"/);
  assert.match(mainSource, /mode === "hosted"/);
  assert.match(panelSource, /已归档文件/);
  assert.match(panelSource, /复制 .*公开链接/);
  assert.match(panelSource, /export function ArchivedLibraryDialog/);
  assert.match(panelSource, /id="archived-library-dialog"/);
  assert.match(panelSource, /aria-modal="true"/);
  assert.match(panelSource, /event\.key === "Escape"/);
  assert.match(panelSource, /export function ShareActionsDialog/);
  assert.match(panelSource, /copyText\(url\)/);
  assert.match(panelSource, /await onDownload\(\)/);
  assert.match(panelSource, /aria-label="复制公开链接"/);
  assert.match(panelSource, /className="public-download-progress"/);
  assert.match(panelSource, /role={kind === "error" \? "alert" : "status"}/);
  const commentPanelSource = panelSource.slice(
    panelSource.indexOf("export function ShareCommentsPanel"),
    panelSource.indexOf("export function PublicShareState"),
  );
  assert.equal((commentPanelSource.match(/className="comment-editor"/g) || []).length, 1);
  assert.match(commentPanelSource, /contentEditable=\{!submitting\}/);
  assert.doesNotMatch(commentPanelSource, /<textarea/);
  assert.doesNotMatch(commentPanelSource, /<input|称呼（选填）|COMMENT_NICKNAME_STORAGE_KEY|匿名/);
  assert.match(commentPanelSource, /\{!draftBody && <TimelineHint \/>\}/);
  assert.doesNotMatch(commentPanelSource, /placeholder="写下评论或备注"/);
  assert.match(commentPanelSource, /avatars\/\$\{comment\.avatar\}\.webp/);
  assert.match(commentPanelSource, /width="32"/);
  assert.match(commentPanelSource, /评论已归档/);
  assert.match(commentPanelSource, /onArchive\(comment\)/);
  assert.match(commentPanelSource, /onRestore\(comment\)/);
  assert.match(commentPanelSource, /loadError \? null : comments\.length/);
  assert.doesNotMatch(commentPanelSource, /comments-share-card/);
  assert.equal((appSource.match(/className="public-comments-inline"/g) || []).length, 1);
  assert.match(
    appSource,
    /<RuntimeEventConsole log=\{runtimeEventLog\} \/>[\s\S]{0,240}className="public-comments-inline"/,
  );
  assert.match(appSource, /commentSubmitBusyRef\.current/);
  assert.match(panelSource, />分享文件</);
  assert.match(panelSource, />下载</);
  assert.match(styleSource, /\.import-dropzone\.is-dragging/);
  assert.match(styleSource, /\.file-upload-progress/);
  assert.match(styleSource, /\.preview-file-add[\s\S]{0,260}color:\s*var\(--text\);[\s\S]{0,80}background:\s*var\(--control\)/);
  assert.match(styleSource, /\.preview-file-rail-row\.is-current::before/);
  assert.match(styleSource, /\.archived-library-trigger \.archived-library-count[\s\S]{0,320}background:\s*transparent/);
  assert.match(styleSource, /\.topbar-copy-link\.is-copied,[\s\S]{0,240}background:\s*var\(--control\)/);
  assert.doesNotMatch(styleSource, /#f6d76b/);
  assert.match(styleSource, /\.public-download-progress/);
  assert.match(styleSource, /var\(--preview-file-rail-width, 184px\)/);
  assert.match(styleSource, /grid-template-columns:\s*40px minmax\(0, 1fr\) max-content/);
  assert.match(styleSource, /\.file-heading-copy-link[\s\S]{0,520}background:\s*var\(--accent\)/);
  assert.match(styleSource, /\.topbar-copy-link[\s\S]{0,220}min-width:\s*122px/);
  assert.match(styleSource, /\.topbar-download > \.topbar-action-label/);
  assert.doesNotMatch(styleSource, /\.topbar-download > span/);
  assert.match(styleSource, /\.archived-library-dialog[\s\S]{0,420}max-height:\s*calc\(100dvh - 40px\)/);
  assert.match(styleSource, /\.archived-dialog-body[\s\S]{0,220}overflow-y:\s*auto/);
  assert.match(styleSource, /\.brand-signature/);
  assert.match(styleSource, /\.feedback-credit/);
  assert.match(styleSource, /\.share-action-stack[\s\S]{0,120}display:\s*grid/);
  assert.match(styleSource, /\.share-link-value[\s\S]{0,220}overflow-wrap:\s*anywhere/);
  assert.match(styleSource, /@media \(any-hover: hover\) and \(any-pointer: fine\)/);
  assert.match(styleSource, /textarea:focus-visible/);
  assert.match(styleSource, /\.comment-author img[\s\S]{0,180}width:\s*32px[\s\S]{0,80}height:\s*32px[\s\S]{0,100}border-radius:\s*50%[\s\S]{0,80}object-fit:\s*cover/);
  assert.match(styleSource, /\.comment-item-archived summary/);
  assert.match(styleSource, /@media \(max-width: 520px\)[\s\S]*\.comment-editor[\s\S]*font-size:\s*16px/);
  assert.match(clipboardSource, /navigator\.clipboard\?\.writeText/);
  assert.match(clipboardSource, /document\.execCommand\("copy"\)/);
  assert.match(identitySource, /rive-host-comment-visitor-v1/);
  assert.match(identitySource, /window\.localStorage\.getItem/);
  assert.match(identitySource, /window\.localStorage\.setItem/);
  assert.doesNotMatch(identitySource, /canvas|navigator\.|screen\.|fingerprint/i);
});

test("resolves static assets from Vite's configured public base", async () => {
  const [viteSource, html, playerSource, librarySource, iconSource] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../static/index.html", import.meta.url), "utf8"),
    readFile(new URL("../lib/rive-player.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/rive-viewer/Icon.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(viteSource, /process\.env\.RIVE_VIEWER_BASE/);
  assert.match(html, /%BASE_URL%favicon\.webp/);
  assert.match(html, /%BASE_URL%rive-webgl2-2\.39\.1\.wasm/);
  assert.match(playerSource, /publicAssetUrl\(runtimeWasmFile\(renderEngine\)\)/);
  assert.match(librarySource, /RECENT_HOSTED_STORE_NAME = "recent-hosted"/);
  assert.match(iconSource, /publicAssetUrl\(`icons\/\$\{name\}\.svg`\)/);
  const avatarFiles = (await readdir(new URL("../public/rive-viewer/avatars", import.meta.url)))
    .filter((name) => name.endsWith(".webp"));
  assert.equal(avatarFiles.length, 32);
});

test("uses a bounded custom speed menu instead of a native select", async () => {
  const [styleSource, appSource] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/rive-viewer/RiveViewerApp.tsx", import.meta.url), "utf8"),
  ]);
  const speedRules = styleSource.slice(
    styleSource.indexOf(".speed-menu"),
    styleSource.indexOf(".fit-group"),
  );

  assert.match(speedRules, /overflow:\s*hidden/);
  assert.match(speedRules, /\.speed-menu \.speed-gauge\s*\{[\s\S]*width:\s*18px/);
  assert.match(speedRules, /\.speed-menu \.speed-gauge\s*\{[\s\S]*height:\s*18px/);
  assert.match(speedRules, /transform:\s*none/);
  assert.match(appSource, /className="speed-menu-popover" role="listbox"/);
  assert.match(appSource, /role="option"/);
  assert.doesNotMatch(appSource, /<select value=\{speed\}/);
});

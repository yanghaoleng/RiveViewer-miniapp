import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { MAX_FILE_BYTES } from "./config.mjs";
import { AppError, isAppError } from "./errors.mjs";
import { pickForestIdentity } from "./forest-identities.mjs";
import {
  decodeFilenameHeader,
  stageRiveStream,
} from "./ingest.mjs";
import { ShareStore } from "./store.mjs";

const CODE_PATH = "([0-9A-Za-z]{3})";
const SHARE_PATTERN = new RegExp(`^/api/v1/shares/${CODE_PATH}$`);
const FILE_PATTERN = new RegExp(`^/api/v1/shares/${CODE_PATH}/file$`);
const COMMENTS_PATTERN = new RegExp(`^/api/v1/shares/${CODE_PATH}/comments$`);
const COMMENT_ARCHIVE_PATTERN = new RegExp(
  `^/api/v1/shares/${CODE_PATH}/comments/([^/]+)/archive$`,
);
const COMMENT_RESTORE_PATTERN = new RegExp(
  `^/api/v1/shares/${CODE_PATH}/comments/([^/]+)/restore$`,
);
const ARCHIVE_PATTERN = new RegExp(`^/api/v1/shares/${CODE_PATH}/archive$`);
const RESTORE_PATTERN = new RegExp(`^/api/v1/shares/${CODE_PATH}/restore$`);
const MAX_JSON_BYTES = 16 * 1024;

function applyCommonHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response, status, value, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(payload);
}

function sendError(response, error) {
  const status = isAppError(error) ? error.status : 500;
  const code = isAppError(error) ? error.code : "internal_error";
  const message = isAppError(error) ? error.message : "服务器内部错误";
  sendJson(response, status, { error: { code, message } });
}

function parseContentLength(request) {
  const header = request.headers["content-length"];
  if (header === undefined) return null;
  if (Array.isArray(header) || !/^[0-9]+$/.test(header)) {
    throw new AppError(400, "invalid_content_length", "Content-Length 无效");
  }
  const value = Number(header);
  if (!Number.isSafeInteger(value)) {
    throw new AppError(400, "invalid_content_length", "Content-Length 无效");
  }
  return value;
}

function requireActionHeader(request, expected) {
  const value = request.headers["x-rive-action"];
  if (Array.isArray(value) || value !== expected) {
    throw new AppError(400, "missing_action_header", "缺少有效的操作确认标记");
  }
}

async function readJson(request) {
  const type = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new AppError(415, "unsupported_media_type", "评论必须使用 application/json");
  }
  const declaredLength = parseContentLength(request);
  if (declaredLength !== null && declaredLength > MAX_JSON_BYTES) {
    throw new AppError(413, "json_too_large", "请求内容过大");
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw new AppError(413, "json_too_large", "请求内容过大");
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new AppError(400, "invalid_json", "JSON 内容无效");
  }
}

function normalizeHeader(value, limit) {
  return (Array.isArray(value) ? value[0] : String(value || "")).slice(0, limit);
}

function commentIdentitySource(request, payload) {
  if (payload.visitorId !== undefined) {
    if (typeof payload.visitorId !== "string" || !/^[0-9A-Za-z-]{16,80}$/.test(payload.visitorId)) {
      throw new AppError(422, "invalid_visitor", "访问标识无效");
    }
    return `visitor:${payload.visitorId}`;
  }
  const forwarded = normalizeHeader(request.headers["x-forwarded-for"], 128).split(",", 1)[0].trim();
  const address = forwarded || normalizeHeader(request.socket?.remoteAddress, 128);
  const userAgent = normalizeHeader(request.headers["user-agent"], 256);
  return `network:${address}|agent:${userAgent}`;
}

function normalizeComment(request, payload) {
  if (typeof payload.body !== "string") {
    throw new AppError(422, "invalid_comment", "评论正文必须是文本");
  }
  const body = payload.body.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  const length = [...body].length;
  if (length < 1 || length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) {
    throw new AppError(422, "invalid_comment", "评论正文须为 1 到 1000 个字符");
  }
  const identity = pickForestIdentity(commentIdentitySource(request, payload));
  return { ...identity, body };
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;

  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < 0
      || end < start
      || start >= size
    ) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function encodeContentDisposition(filename) {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_") || "file.riv";
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function sendFile(request, response, file) {
  const { metadata, filePath } = file;
  const rangeHeader = request.headers.range;
  const useRange = !request.headers["if-range"] || request.headers["if-range"] === metadata.etag;
  const range = useRange ? parseRange(Array.isArray(rangeHeader) ? "" : rangeHeader, metadata.size) : null;

  if (range === false) {
    response.writeHead(416, {
      "Content-Range": `bytes */${metadata.size}`,
      "Content-Length": 0,
      ETag: metadata.etag,
      "Accept-Ranges": "bytes",
    });
    response.end();
    return;
  }

  if (!range && request.headers["if-none-match"] === metadata.etag) {
    response.writeHead(304, { ETag: metadata.etag, "Content-Length": 0 });
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? metadata.size - 1;
  const length = end - start + 1;
  const status = range ? 206 : 200;
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": length,
    "Content-Disposition": encodeContentDisposition(metadata.filename),
    "Accept-Ranges": "bytes",
    ETag: metadata.etag,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${metadata.size}`;
  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  await pipeline(createReadStream(filePath, { start, end }), response);
}

export async function createRiveHostApp({
  dataDir,
  maxTotalBytes,
  codeGenerator,
  now,
  diskFreeProvider,
  logger = console,
} = {}) {
  const store = await ShareStore.open({
    dataDir,
    maxTotalBytes,
    codeGenerator,
    now,
    diskFreeProvider,
    logger,
  });

  const handler = async (request, response) => {
    applyCommonHeaders(response);
    try {
      const url = new URL(request.url, "http://rive-host.local");
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (pathname === "/api/v1/shares") {
        if (request.method === "GET") {
          const status = url.searchParams.get("status") || "active";
          if (!['active', 'archived'].includes(status)) {
            throw new AppError(400, "invalid_status", "status 必须是 active 或 archived");
          }
          sendJson(response, 200, { items: store.list(status) });
          return;
        }
        if (request.method === "POST") {
          const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
          if (contentType !== "application/octet-stream") {
            throw new AppError(415, "unsupported_media_type", "上传必须使用 application/octet-stream");
          }
          const filename = decodeFilenameHeader(request.headers["x-rive-filename"]);
          const declaredLength = parseContentLength(request);
          if (declaredLength !== null && declaredLength > MAX_FILE_BYTES) {
            throw new AppError(413, "file_too_large", "Rive 文件不能超过 64 MiB");
          }
          await store.assertUploadAllowed(declaredLength || 0);

          const staged = await stageRiveStream(request, store.tempDir);
          try {
            const item = await store.createFromStaged({
              ...staged,
              filename,
              isExample: false,
            });
            sendJson(response, 201, { item });
          } finally {
            await unlink(staged.tempPath).catch(() => {});
          }
          return;
        }
        throw new AppError(405, "method_not_allowed", "请求方法不支持");
      }

      let match = SHARE_PATTERN.exec(pathname);
      if (match) {
        if (request.method !== "GET") throw new AppError(405, "method_not_allowed", "请求方法不支持");
        const item = store.get(match[1]);
        if (!item) throw new AppError(404, "share_not_found", "分享不存在");
        sendJson(response, 200, { item });
        return;
      }

      match = FILE_PATTERN.exec(pathname);
      if (match) {
        if (!['GET', 'HEAD'].includes(request.method)) {
          throw new AppError(405, "method_not_allowed", "请求方法不支持");
        }
        const file = store.getFile(match[1]);
        if (!file) throw new AppError(404, "share_not_found", "分享不存在");
        if (file.metadata.status === "archived") {
          throw new AppError(410, "share_archived", "分享已归档");
        }
        await sendFile(request, response, file);
        return;
      }

      match = COMMENTS_PATTERN.exec(pathname);
      if (match) {
        if (request.method === "GET") {
          const items = store.comments(match[1]);
          if (!items) throw new AppError(404, "share_not_found", "分享不存在");
          sendJson(response, 200, { items });
          return;
        }
        if (request.method === "POST") {
          if (!store.get(match[1])) throw new AppError(404, "share_not_found", "分享不存在");
          const item = await store.addComment(match[1], normalizeComment(request, await readJson(request)));
          sendJson(response, 201, { item });
          return;
        }
        throw new AppError(405, "method_not_allowed", "请求方法不支持");
      }

      match = COMMENT_ARCHIVE_PATTERN.exec(pathname);
      if (match) {
        if (request.method !== "POST") throw new AppError(405, "method_not_allowed", "请求方法不支持");
        requireActionHeader(request, "archive");
        sendJson(response, 200, { item: await store.archiveComment(match[1], match[2]) });
        return;
      }

      match = COMMENT_RESTORE_PATTERN.exec(pathname);
      if (match) {
        if (request.method !== "POST") throw new AppError(405, "method_not_allowed", "请求方法不支持");
        requireActionHeader(request, "restore");
        sendJson(response, 200, { item: await store.restoreComment(match[1], match[2]) });
        return;
      }

      match = ARCHIVE_PATTERN.exec(pathname);
      if (match) {
        if (request.method !== "POST") throw new AppError(405, "method_not_allowed", "请求方法不支持");
        requireActionHeader(request, "archive");
        sendJson(response, 200, { item: await store.archive(match[1]) });
        return;
      }

      match = RESTORE_PATTERN.exec(pathname);
      if (match) {
        if (request.method !== "POST") throw new AppError(405, "method_not_allowed", "请求方法不支持");
        requireActionHeader(request, "restore");
        sendJson(response, 200, { item: await store.restore(match[1]) });
        return;
      }

      throw new AppError(404, "not_found", "接口不存在");
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (!isAppError(error)) logger.error?.(error);
      sendError(response, error);
    }
  };

  return { handler, store };
}

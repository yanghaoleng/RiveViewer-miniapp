import { createHash, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { MAX_FILE_BYTES } from "./config.mjs";
import { AppError } from "./errors.mjs";

const RIVE_MAGIC = Buffer.from("RIVE", "ascii");

export function normalizeFilename(value) {
  if (typeof value !== "string") {
    throw new AppError(400, "missing_filename", "缺少 X-Rive-Filename");
  }

  const filename = value.normalize("NFC").trim();
  if (!filename) {
    throw new AppError(400, "invalid_filename", "文件名不能为空");
  }
  if ([...filename].length > 255 || Buffer.byteLength(filename, "utf8") > 768) {
    throw new AppError(400, "invalid_filename", "文件名过长");
  }
  if (/[/\\\u0000-\u001f\u007f]/u.test(filename)) {
    throw new AppError(400, "invalid_filename", "文件名包含非法字符");
  }
  if (!filename.toLowerCase().endsWith(".riv")) {
    throw new AppError(422, "invalid_extension", "只接受 .riv 文件");
  }
  return filename;
}

export function decodeFilenameHeader(headerValue) {
  if (Array.isArray(headerValue) || typeof headerValue !== "string") {
    throw new AppError(400, "missing_filename", "缺少 X-Rive-Filename");
  }
  try {
    return normalizeFilename(decodeURIComponent(headerValue));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "invalid_filename", "X-Rive-Filename 编码无效");
  }
}

export async function stageRiveStream(readable, tempDir, { maxBytes = MAX_FILE_BYTES } = {}) {
  const tempPath = path.join(
    tempDir,
    `upload-${process.pid}-${Date.now()}-${randomBytes(8).toString("hex")}.tmp`,
  );
  const handle = await open(tempPath, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  let magic = Buffer.alloc(0);
  let tooLarge = false;

  try {
    for await (const value of readable) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (tooLarge) continue;
      if (size + chunk.length > maxBytes) {
        tooLarge = true;
        continue;
      }
      size += chunk.length;
      hash.update(chunk);
      if (magic.length < RIVE_MAGIC.length) {
        magic = Buffer.concat([magic, chunk.subarray(0, RIVE_MAGIC.length - magic.length)]);
      }
      await handle.writeFile(chunk);
    }
    if (tooLarge) {
      throw new AppError(413, "file_too_large", "Rive 文件不能超过 64 MiB");
    }
    if (size < RIVE_MAGIC.length || !magic.equals(RIVE_MAGIC)) {
      throw new AppError(422, "invalid_rive", "文件头不是有效的 RIVE");
    }
    await handle.sync();
    return {
      tempPath,
      size,
      sha256: hash.digest("hex"),
    };
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  } finally {
    await handle.close().catch(() => {});
  }
}

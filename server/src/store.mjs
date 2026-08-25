import { randomInt, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { assertDataDirOutsideRelease, MIN_FREE_BYTES, SERVER_ROOT } from "./config.mjs";
import { AppError } from "./errors.mjs";
import { isForestAvatar, pickForestIdentity } from "./forest-identities.mjs";

const STATE_VERSION = 1;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_PATTERN = /^[0-9A-Za-z]{3}$/;
const STORAGE_NAME_PATTERN = /^[0-9a-f-]{36}\.riv$/;
const MAX_SHARES = 10_000;
const MAX_COMMENTS_PER_SHARE = 500;
const MAX_TOTAL_COMMENTS = 5_000;
const RESERVED_CODES = new Set(["api"]);

function emptyState() {
  return { version: STATE_VERSION, shares: [] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeLegacyComments(state) {
  let changed = false;
  if (!state || !Array.isArray(state.shares)) return { state, changed };

  for (const share of state.shares) {
    if (!Array.isArray(share?.comments)) continue;
    for (const comment of share.comments) {
      if (!comment || typeof comment !== "object" || Array.isArray(comment)) continue;
      if (!Object.hasOwn(comment, "status")) {
        comment.status = "active";
        changed = true;
      }
      if (!Object.hasOwn(comment, "archivedAt")) {
        comment.archivedAt = null;
        changed = true;
      }
      if (!Object.hasOwn(comment, "avatar")) {
        const identity = pickForestIdentity(`legacy:${comment.nickname || comment.id || "comment"}`);
        comment.avatar = identity.avatar;
        if (!comment.nickname || comment.nickname === "匿名") comment.nickname = identity.nickname;
        changed = true;
      }
    }
  }
  return { state, changed };
}

function publicMetadata(share) {
  return {
    code: share.code,
    filename: share.filename,
    size: share.size,
    sha256: share.sha256,
    etag: share.etag,
    isExample: share.isExample,
    status: share.status,
    createdAt: share.createdAt,
    archivedAt: share.archivedAt,
    commentCount: share.comments.length,
  };
}

function validateState(state) {
  if (!state || state.version !== STATE_VERSION || !Array.isArray(state.shares)) {
    throw new Error("state.json 结构或版本无效");
  }
  if (state.shares.length > MAX_SHARES) {
    throw new Error("state.json 的分享数量超过上限");
  }
  const codes = new Set();
  let totalComments = 0;
  for (const share of state.shares) {
    if (!CODE_PATTERN.test(share?.code || "") || codes.has(share.code)) {
      throw new Error("state.json 包含无效或重复的分享码");
    }
    codes.add(share.code);
    if (
      typeof share.filename !== "string"
      || !Number.isSafeInteger(share.size)
      || share.size < 4
      || !/^[0-9a-f]{64}$/.test(share.sha256 || "")
      || !STORAGE_NAME_PATTERN.test(share.storageName || "")
      || share.etag !== `"sha256-${share.sha256}"`
      || typeof share.isExample !== "boolean"
      || !["active", "archived"].includes(share.status)
      || typeof share.createdAt !== "string"
      || (share.archivedAt !== null && typeof share.archivedAt !== "string")
      || !Array.isArray(share.comments)
    ) {
      throw new Error(`state.json 中分享 ${share.code} 的字段无效`);
    }
    if (share.comments.length > MAX_COMMENTS_PER_SHARE) {
      throw new Error(`state.json 中分享 ${share.code} 的评论数量超过上限`);
    }
    totalComments += share.comments.length;
    for (const comment of share.comments) {
      if (
        typeof comment?.id !== "string"
        || typeof comment.nickname !== "string"
        || !isForestAvatar(comment.avatar)
        || typeof comment.body !== "string"
        || typeof comment.createdAt !== "string"
        || !["active", "archived"].includes(comment.status)
        || (comment.archivedAt !== null && typeof comment.archivedAt !== "string")
      ) {
        throw new Error(`state.json 中分享 ${share.code} 的评论无效`);
      }
    }
  }
  if (totalComments > MAX_TOTAL_COMMENTS) {
    throw new Error("state.json 的评论总量超过上限");
  }
  return state;
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeJsonAtomic(filePath, state) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.state-${process.pid}-${Date.now()}-${randomUUID()}.tmp`,
  );
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  let handle;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tempPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function generateBase62Code() {
  return Array.from({ length: 3 }, () => BASE62[randomInt(BASE62.length)]).join("");
}

export class ShareStore {
  constructor({
    dataDir,
    maxTotalBytes,
    codeGenerator = generateBase62Code,
    now = () => new Date().toISOString(),
    diskFreeProvider,
    logger = console,
  }) {
    this.dataDir = dataDir;
    this.filesDir = path.join(dataDir, "files");
    this.tempDir = path.join(dataDir, "tmp");
    this.statePath = path.join(dataDir, "state.json");
    this.maxTotalBytes = maxTotalBytes;
    this.codeGenerator = codeGenerator;
    this.now = now;
    this.logger = logger;
    this.diskFreeProvider = diskFreeProvider || (() => this.#readDiskFreeBytes());
    this.state = emptyState();
    this.mutationTail = Promise.resolve();
    this.warnedStatfsUnavailable = false;
  }

  static async open(options) {
    const store = new ShareStore(options);
    await store.#initialize();
    return store;
  }

  async #initialize() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const [realDataDir, realServerRoot] = await Promise.all([
      fs.realpath(this.dataDir),
      fs.realpath(SERVER_ROOT),
    ]);
    assertDataDirOutsideRelease(realDataDir, realServerRoot);
    await Promise.all([
      fs.mkdir(this.filesDir, { recursive: true, mode: 0o700 }),
      fs.mkdir(this.tempDir, { recursive: true, mode: 0o700 }),
    ]);
    await this.#removeStaleTemps();

    let stateNeedsRewrite = false;
    try {
      const normalized = normalizeLegacyComments(
        JSON.parse(await fs.readFile(this.statePath, "utf8")),
      );
      this.state = validateState(normalized.state);
      stateNeedsRewrite = normalized.changed;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.state = emptyState();
      await writeJsonAtomic(this.statePath, this.state);
    }
    await this.#validateStoredFiles();
    if (stateNeedsRewrite) await writeJsonAtomic(this.statePath, this.state);
  }

  async #validateStoredFiles() {
    for (const share of this.state.shares) {
      const filePath = path.join(this.filesDir, share.storageName);
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        throw new Error(`分享 ${share.code} 的文件缺失`, { cause: error });
      }
      if (!stats.isFile() || stats.size !== share.size) {
        throw new Error(`分享 ${share.code} 的文件大小与索引不一致`);
      }
    }
  }

  async #removeStaleTemps() {
    const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^upload-.*\.tmp$/.test(entry.name))
      .map((entry) => fs.unlink(path.join(this.tempDir, entry.name)).catch(() => {})));
  }

  async #readDiskFreeBytes() {
    if (typeof fs.statfs !== "function") {
      if (!this.warnedStatfsUnavailable) {
        this.warnedStatfsUnavailable = true;
        this.logger.warn?.("当前 Node 运行时不支持 statfs；继续强制托管总量上限，跳过磁盘余量检查");
      }
      return null;
    }
    const stats = await fs.statfs(this.dataDir);
    return stats.bavail * stats.bsize;
  }

  #totalBytes(state = this.state) {
    return state.shares.reduce((total, share) => total + share.size, 0);
  }

  async assertUploadAllowed(incomingBytes = 0, state = this.state) {
    if (this.#totalBytes(state) + incomingBytes > this.maxTotalBytes) {
      throw new AppError(507, "storage_limit", "托管文件总量已达到上限");
    }
    const freeBytes = await this.diskFreeProvider();
    if (freeBytes !== null && freeBytes < MIN_FREE_BYTES) {
      throw new AppError(507, "disk_space_low", "服务器磁盘可用空间不足");
    }
  }

  list(status) {
    return this.state.shares
      .filter((share) => share.status === status && !share.isExample)
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicMetadata);
  }

  get(code) {
    const share = this.state.shares.find((item) => item.code === code);
    return share ? publicMetadata(share) : null;
  }

  getFile(code) {
    const share = this.state.shares.find((item) => item.code === code);
    if (!share) return null;
    return {
      metadata: publicMetadata(share),
      filePath: path.join(this.filesDir, share.storageName),
    };
  }

  comments(code) {
    const share = this.state.shares.find((item) => item.code === code);
    return share ? clone(share.comments) : null;
  }

  findExampleBySha256(sha256) {
    const share = this.state.shares.find((item) => item.isExample && item.sha256 === sha256);
    return share ? publicMetadata(share) : null;
  }

  async createFromStaged({ tempPath, filename, size, sha256, isExample }) {
    return this.#enqueue(async () => {
      if (this.state.shares.length >= MAX_SHARES) {
        throw new AppError(507, "share_limit", "托管文件数量已达到上限");
      }
      await this.assertUploadAllowed(size, this.state);
      let code;
      for (let attempt = 0; attempt < 10_000; attempt += 1) {
        const candidate = this.codeGenerator();
        if (!CODE_PATTERN.test(candidate)) {
          throw new Error("codeGenerator 必须返回三位 Base62 分享码");
        }
        const codeTaken = RESERVED_CODES.has(candidate.toLowerCase())
          || this.state.shares.some((share) => share.code === candidate);
        if (!codeTaken) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        throw new AppError(503, "code_unavailable", "暂时无法生成分享码，请重试");
      }

      const createdAt = this.now();
      const storageName = `${randomUUID()}.riv`;
      const record = {
        code,
        storageName,
        filename,
        size,
        sha256,
        etag: `"sha256-${sha256}"`,
        isExample,
        status: "active",
        createdAt,
        archivedAt: null,
        comments: [],
      };
      const destination = path.join(this.filesDir, storageName);
      await fs.rename(tempPath, destination);
      try {
        await syncDirectory(this.filesDir);
        const nextState = clone(this.state);
        nextState.shares.push(record);
        await writeJsonAtomic(this.statePath, nextState);
        this.state = nextState;
        return publicMetadata(record);
      } catch (error) {
        await fs.unlink(destination).catch(() => {});
        await syncDirectory(this.filesDir).catch(() => {});
        throw error;
      }
    });
  }

  async addComment(code, { nickname, avatar, body }) {
    return this.#mutate((state) => {
      const share = state.shares.find((item) => item.code === code);
      if (!share) throw new AppError(404, "share_not_found", "分享不存在");
      if (share.status === "archived") {
        throw new AppError(409, "share_archived", "归档分享不能新增评论");
      }
      if (share.comments.length >= MAX_COMMENTS_PER_SHARE) {
        throw new AppError(429, "comment_limit", "这个文件的评论数量已达到上限");
      }
      const totalComments = state.shares.reduce((total, item) => total + item.comments.length, 0);
      if (totalComments >= MAX_TOTAL_COMMENTS) {
        throw new AppError(507, "comment_storage_limit", "评论总量已达到上限");
      }
      const comment = {
        id: randomUUID(),
        nickname,
        avatar,
        body,
        createdAt: this.now(),
        status: "active",
        archivedAt: null,
      };
      share.comments.push(comment);
      return clone(comment);
    });
  }

  async archiveComment(code, commentId) {
    return this.#mutate((state) => {
      const share = state.shares.find((item) => item.code === code);
      if (!share) throw new AppError(404, "share_not_found", "分享不存在");
      const comment = share.comments.find((item) => item.id === commentId);
      if (!comment) throw new AppError(404, "comment_not_found", "评论不存在");
      if (comment.status !== "archived") {
        comment.status = "archived";
        comment.archivedAt = this.now();
      }
      return clone(comment);
    });
  }

  async restoreComment(code, commentId) {
    return this.#mutate((state) => {
      const share = state.shares.find((item) => item.code === code);
      if (!share) throw new AppError(404, "share_not_found", "分享不存在");
      const comment = share.comments.find((item) => item.id === commentId);
      if (!comment) throw new AppError(404, "comment_not_found", "评论不存在");
      comment.status = "active";
      comment.archivedAt = null;
      return clone(comment);
    });
  }

  async archive(code) {
    return this.#mutate((state) => {
      const share = state.shares.find((item) => item.code === code);
      if (!share) throw new AppError(404, "share_not_found", "分享不存在");
      if (share.status !== "archived") {
        share.status = "archived";
        share.archivedAt = this.now();
      }
      return publicMetadata(share);
    });
  }

  async restore(code) {
    return this.#mutate((state) => {
      const share = state.shares.find((item) => item.code === code);
      if (!share) throw new AppError(404, "share_not_found", "分享不存在");
      share.status = "active";
      share.archivedAt = null;
      return publicMetadata(share);
    });
  }

  async #mutate(mutator) {
    return this.#enqueue(async () => {
      const nextState = clone(this.state);
      const result = mutator(nextState);
      await writeJsonAtomic(this.statePath, nextState);
      this.state = nextState;
      return result;
    });
  }

  #enqueue(operation) {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.catch(() => {});
    return result;
  }
}

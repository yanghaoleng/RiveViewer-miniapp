export type LibraryFile = {
  id: string;
  name: string;
  size: number;
  updatedAt: number;
  builtin?: boolean;
  url?: string;
  cover?: Blob;
};

type StoredRiveFile = LibraryFile & {
  data: ArrayBuffer;
};

const DB_NAME = "rive-viewer-h5";
type StoredCover = {
  id: string;
  blob: Blob;
};

const DB_VERSION = 2;
const STORE_NAME = "files";
const COVER_STORE_NAME = "covers";
const HIDDEN_BUILTIN_STORAGE_KEY = "rive-viewer-hidden-builtins-v1";

export const BUILTIN_FILES: LibraryFile[] = [
  {
    id: "builtin-guide",
    name: "引导页动画750_1160.riv",
    size: 0,
    updatedAt: 0,
    builtin: true,
    url: "/rive-viewer/samples/guide.riv",
  },
  {
    id: "builtin-question",
    name: "题目动画_1.riv",
    size: 0,
    updatedAt: 0,
    builtin: true,
    url: "/rive-viewer/samples/question.riv",
  },
];

function readHiddenBuiltinIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = JSON.parse(window.localStorage.getItem(HIDDEN_BUILTIN_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function getVisibleBuiltinFiles(): LibraryFile[] {
  const hiddenIds = readHiddenBuiltinIds();
  return BUILTIN_FILES.filter((file) => !hiddenIds.has(file.id));
}

export function hideBuiltinFile(id: string): void {
  if (typeof window === "undefined") return;
  const hiddenIds = readHiddenBuiltinIds();
  hiddenIds.add(id);
  window.localStorage.setItem(HIDDEN_BUILTIN_STORAGE_KEY, JSON.stringify([...hiddenIds]));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(COVER_STORE_NAME)) {
        database.createObjectStore(COVER_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地文件库"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地文件操作失败"));
  });
}

export async function listLocalFiles(): Promise<LibraryFile[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredRiveFile[]>,
    );
    return records
      .map((record) => ({
        id: record.id,
        name: record.name,
        size: record.size,
        updatedAt: record.updatedAt,
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    database.close();
  }
}

export async function attachLibraryCovers(files: LibraryFile[]): Promise<LibraryFile[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(COVER_STORE_NAME, "readonly");
    const covers = await requestResult(
      transaction.objectStore(COVER_STORE_NAME).getAll() as IDBRequest<StoredCover[]>,
    );
    const coverMap = new Map(covers.map((cover) => [cover.id, cover.blob]));
    return files.map((file) => ({ ...file, cover: coverMap.get(file.id) }));
  } finally {
    database.close();
  }
}

export async function saveLibraryCover(id: string, blob: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(COVER_STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(COVER_STORE_NAME).put({ id, blob }));
  } finally {
    database.close();
  }
}

export async function saveLocalFile(file: File): Promise<LibraryFile> {
  const data = await file.arrayBuffer();
  const record: StoredRiveFile = {
    id: `local-${crypto.randomUUID()}`,
    name: file.name,
    size: file.size,
    updatedAt: Date.now(),
    data,
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
    return {
      id: record.id,
      name: record.name,
      size: record.size,
      updatedAt: record.updatedAt,
    };
  } finally {
    database.close();
  }
}

export async function readLibraryFile(file: LibraryFile): Promise<ArrayBuffer> {
  if (file.builtin && file.url) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error("示例文件读取失败");
    return response.arrayBuffer();
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(file.id) as IDBRequest<StoredRiveFile | undefined>,
    );
    if (!record?.data) throw new Error("本地文件不存在，可能已被浏览器清理");
    return record.data;
  } finally {
    database.close();
  }
}

export async function deleteLocalFile(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([STORE_NAME, COVER_STORE_NAME], "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).delete(id));
    await requestResult(transaction.objectStore(COVER_STORE_NAME).delete(id));
  } finally {
    database.close();
  }
}

export function formatBytes(size: number): string {
  if (!size) return "示例";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return "内置文件";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

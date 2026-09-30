"use client";

// Browser-side safety net for meeting recordings: MediaRecorder chunks go
// into IndexedDB as they arrive, so a crash, reload or failed upload loses
// nothing. A finished segment is assembled, uploaded, registered and only
// then deleted here; leftovers are retried on the next page load.

const DB_NAME = "abl-recordings";
const DB_VERSION = 1;

export interface SegmentMeta {
  key: string; // `${meetingId}:${idx}`
  meetingId: string;
  idx: number;
  mimeType: string;
  offsetMs: number; // transcript time where the segment starts
  startedAt: number;
  stoppedAt?: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("segments")) db.createObjectStore("segments", { keyPath: "key" });
      if (!db.objectStoreNames.contains("chunks")) {
        const chunks = db.createObjectStore("chunks", { autoIncrement: true });
        chunks.createIndex("segment", "segment");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const req = fn(tx);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function putSegment(meta: SegmentMeta): Promise<void> {
  await run(["segments"], "readwrite", (tx) => tx.objectStore("segments").put(meta));
}

export async function addChunk(segment: string, data: Blob): Promise<void> {
  await run(["chunks"], "readwrite", (tx) => tx.objectStore("chunks").add({ segment, data }));
}

export async function listSegments(): Promise<SegmentMeta[]> {
  return (await run<SegmentMeta[]>(["segments"], "readonly", (tx) => tx.objectStore("segments").getAll())) ?? [];
}

// The segment's audio, chunks in recording order (auto-increment keys)
export async function segmentBlob(meta: SegmentMeta): Promise<Blob> {
  const rows =
    (await run<{ data: Blob }[]>(["chunks"], "readonly", (tx) =>
      tx.objectStore("chunks").index("segment").getAll(IDBKeyRange.only(meta.key))
    )) ?? [];
  return new Blob(rows.map((r) => r.data), { type: meta.mimeType });
}

export async function deleteSegment(key: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["segments", "chunks"], "readwrite");
      tx.objectStore("segments").delete(key);
      const cursor = tx.objectStore("chunks").index("segment").openKeyCursor(IDBKeyRange.only(key));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          tx.objectStore("chunks").delete(c.primaryKey);
          c.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

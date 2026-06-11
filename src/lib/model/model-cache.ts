const DATABASE_NAME = 'unionam-converter-model-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'models';
const LAST_MODEL_KEY = 'last-model';

type CachedModelRecord = {
  key: string;
  fileName: string;
  fileType: string;
  updatedAt: number;
  blob: Blob;
};

function openModelCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open local model cache.'));
  });
}

function runStoreOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openModelCache().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to access local model cache.'));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Failed to finish local model cache operation.'));
        };
      }),
  );
}

export async function saveLastModelFile(file: File) {
  const record: CachedModelRecord = {
    key: LAST_MODEL_KEY,
    fileName: file.name,
    fileType: file.type,
    updatedAt: Date.now(),
    blob: file,
  };
  await runStoreOperation('readwrite', (store) => store.put(record));
}

export async function loadLastModelFile() {
  const record = await runStoreOperation<CachedModelRecord | undefined>('readonly', (store) => store.get(LAST_MODEL_KEY));
  if (!record?.blob) return null;
  return new File([record.blob], record.fileName, { type: record.fileType, lastModified: record.updatedAt });
}

export async function clearLastModelFile() {
  await runStoreOperation('readwrite', (store) => store.delete(LAST_MODEL_KEY));
}

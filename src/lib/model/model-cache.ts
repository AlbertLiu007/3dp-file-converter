const DATABASE_NAME = 'unionam-converter-model-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'models';
const LAST_MODEL_KEY = 'last-model';

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

export async function clearLastModelFile() {
  await runStoreOperation('readwrite', (store) => store.delete(LAST_MODEL_KEY));
}

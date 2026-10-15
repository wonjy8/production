// Read only the old draft store; never load the retired editor engine.
export async function legacyDraft(key: string, remove = false): Promise<any> {
  return new Promise((resolve) => {
    let upgraded = false;
    const request = indexedDB.open("production-wordcraft-recovery");
    request.onupgradeneeded = () => {
      upgraded = true;
      request.transaction?.abort();
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (upgraded || !db.objectStoreNames.contains("drafts")) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction("drafts", remove ? "readwrite" : "readonly"),
        store = tx.objectStore("drafts"),
        op = remove ? store.delete(key) : store.get(key);
      let value: any = null;
      op.onsuccess = () => (value = op.result);
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(null);
      };
    };
  });
}

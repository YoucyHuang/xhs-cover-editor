/* 浏览器本地数据库（IndexedDB）
 * localStorage 只有约 5MB，放不下照片和字体，所以：
 *   - 文字、位置、颜色等编辑状态 → localStorage
 *   - 照片 / 签名图（assets）、上传的字体（fonts）、导出过的封面缩略图（gallery）→ IndexedDB
 */
const DB = {
  _p: null,
  open() {
    if (!this._p) {
      this._p = new Promise((resolve, reject) => {
        const req = indexedDB.open('xhs-cover-maker', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of ['assets', 'fonts', 'gallery']) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this._p;
  },
  async _run(store, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  put(store, obj) { return this._run(store, 'readwrite', s => s.put(obj)); },
  get(store, id) { return this._run(store, 'readonly', s => s.get(id)); },
  getAll(store) { return this._run(store, 'readonly', s => s.getAll()); },
  del(store, id) { return this._run(store, 'readwrite', s => s.delete(id)); },
  clear(store) { return this._run(store, 'readwrite', s => s.clear()); },
};

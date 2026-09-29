// Canvas images are stored as Blobs in IndexedDB (localStorage is too small for them).

const Images = (() => {
  const urls = new Map();
  let dbp;

  function db() {
    dbp = dbp || new Promise((resolve, reject) => {
      const req = indexedDB.open('rhythm-images', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('images');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('images', mode);
      const req = fn(t.objectStore('images'));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  }

  return {
    async put(blob, id = uid()) {
      await tx('readwrite', s => s.put(blob, id));
      return id;
    },
    get: id => tx('readonly', s => s.get(id)),
    async url(id) {
      if (urls.has(id)) return urls.get(id);
      const blob = await this.get(id);
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.set(id, u);
      return u;
    },
    remove: id => tx('readwrite', s => s.delete(id)),
    keys: () => tx('readonly', s => s.getAllKeys()),
    clear: () => tx('readwrite', s => s.clear()),
  };
})();

const blobToDataURL = blob => new Promise(res => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.readAsDataURL(blob);
});

const dataURLToBlob = url => fetch(url).then(r => r.blob());

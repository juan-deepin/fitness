const DB_NAME = "the_black_fitness_db";
const DB_VERSION = 1;

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("clientes")) {
        const store = db.createObjectStore("clientes", { keyPath: "id", autoIncrement: true });
        store.createIndex("nombre", "nombre", { unique: false });
        store.createIndex("fecha_creacion", "fecha_creacion", { unique: false });
      }

      if (!db.objectStoreNames.contains("planes")) {
        const store = db.createObjectStore("planes", { keyPath: "id", autoIncrement: true });
        store.createIndex("clienteId", "clienteId", { unique: false });
        store.createIndex("fecha", "fecha", { unique: false });
      }

      if (!db.objectStoreNames.contains("configuracion")) {
        db.createObjectStore("configuracion", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("historial_pdf")) {
        const store = db.createObjectStore("historial_pdf", { keyPath: "id", autoIncrement: true });
        store.createIndex("planId", "planId", { unique: false });
        store.createIndex("fecha", "fecha", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
  });

  return dbPromise;
}

async function runTransaction(storeName, mode, executor) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = executor(store);

    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error || new Error(`Error en transaction de ${storeName}`));
    tx.onabort = () => reject(tx.error || new Error(`Transaction abortada en ${storeName}`));
  });
}

export function addCliente(cliente) {
  return runTransaction("clientes", "readwrite", (store) => store.add(cliente));
}

export function addPlan(plan) {
  return runTransaction("planes", "readwrite", (store) => store.add(plan));
}

export function updatePlan(plan) {
  return runTransaction("planes", "readwrite", (store) => store.put(plan));
}

export function deletePlan(planId) {
  return runTransaction("planes", "readwrite", (store) => store.delete(planId));
}

export function addPdfHistory(pdfRow) {
  return runTransaction("historial_pdf", "readwrite", (store) => store.add(pdfRow));
}

export async function deletePdfHistoryByPlan(planId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("historial_pdf", "readwrite");
    const store = tx.objectStore("historial_pdf");
    const index = store.index("planId");
    const request = index.openCursor(IDBKeyRange.only(planId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("No se pudo limpiar historial PDF."));
  });
}

export function getPlanById(planId) {
  return runTransaction("planes", "readonly", (store) => store.get(planId));
}

export function getClienteById(clienteId) {
  return runTransaction("clientes", "readonly", (store) => store.get(clienteId));
}

export function upsertConfig(config) {
  return runTransaction("configuracion", "readwrite", (store) => store.put({ ...config, id: "main" }));
}

export async function getConfig() {
  const config = await runTransaction("configuracion", "readonly", (store) => store.get("main"));
  return config || null;
}

export async function getAllPlanesWithCliente() {
  const db = await openDatabase();

  const [planes, clientes] = await Promise.all([
    getAllFromStore(db, "planes"),
    getAllFromStore(db, "clientes")
  ]);

  const customerMap = new Map(clientes.map((row) => [row.id, row]));
  return planes
    .map((plan) => ({
      ...plan,
      cliente: customerMap.get(plan.clienteId) || null
    }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export async function getLatestPdfByPlanId(planId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("historial_pdf", "readonly");
    const store = tx.objectStore("historial_pdf");
    const index = store.index("planId");
    const request = index.getAll(IDBKeyRange.only(planId));

    request.onsuccess = () => {
      const rows = request.result || [];
      rows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      resolve(rows[0] || null);
    };

    request.onerror = () => reject(request.error || new Error("No se pudo leer historial PDF."));
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error(`No se pudo obtener store ${storeName}`));
  });
}

/**
 * Firestore aislado del módulo de auth (`firebase.ts`).
 *
 * MOTIVO (perf de arranque): el SDK de Firestore (~490KB) es la pieza más pesada
 * del bundle. Vive aquí, en un módulo que SOLO importan los consumidores de datos
 * (hooks/utils), todos dentro del subárbol lazy `AuthenticatedApp`. Así el SDK de
 * Firestore queda FUERA del chunk de entrada y baja después del primer paint.
 * `firebase.ts` (app + auth, que sí necesita el arranque vía `useAuth`) no importa
 * Firestore, por lo que no lo arrastra al entry.
 *
 * `db` se inicializa al primer import de este módulo (cuando carga el chunk de
 * AuthenticatedApp), antes de que corran los efectos de los consumidores → sigue
 * siendo un singleton síncrono; los consumidores no cambian su forma de usarlo.
 */
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, type Firestore } from "firebase/firestore";
import { app, isFirebaseConfigured } from "./firebase";
import { logger } from "../utils/logger";

let _db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (err) {
    logger.error('Failed to initialize Firestore', err);
  }
}

// Cast a no-null: seguro porque todos los hooks de Firestore guardan con
// `!userId` → nunca tocan db en modo invitado (sin config).
const db = _db as Firestore;

/**
 * Limpia la caché local de Firestore (IndexedDB) tras cerrar sesión (S2b).
 *
 * `signOut` NO borra los documentos cacheados por `persistentLocalCache`, así que
 * en un dispositivo compartido quedarían recuperables. La única forma de vaciarlos
 * es terminar el cliente y limpiar la persistencia; tras `terminate` la instancia
 * queda inutilizable, por lo que el llamador debe recargar la página.
 *
 * Best-effort: puede rechazar si hay otras pestañas con la persistencia abierta
 * (multi-tab). En ese caso se degrada con un warning y el llamador recarga igual.
 */
export const clearFirestorePersistence = async (): Promise<void> => {
  if (!_db) return;
  try {
    await terminate(_db);
    await clearIndexedDbPersistence(_db);
  } catch {
    logger.warn('No se pudo limpiar la caché de Firestore (¿otras pestañas abiertas?)');
  }
};

export { db };

import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { logger } from "../utils/logger";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const isMissingConfig = !firebaseConfig.apiKey || !firebaseConfig.projectId;

// Detect placeholder/dummy values
const isDummyConfig = firebaseConfig.apiKey
  ? (firebaseConfig.apiKey.includes('YOUR_') ||
    firebaseConfig.apiKey.includes('Dummy') ||
    firebaseConfig.apiKey.length < 30)
  : false;

/**
 * Firebase is optional — when config is missing or invalid,
 * the app runs in guest mode (localStorage only, no auth).
 * This prevents build failures and lets devs run without credentials.
 */
export const isFirebaseConfigured = !isMissingConfig && !isDummyConfig;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = initializeFirestore(_app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (err) {
    logger.error('Failed to initialize Firebase', err);
  }
} else if (typeof window !== 'undefined') {
  logger.warn(
    '🔥 Firebase not configured — running in guest mode (localStorage only).\n' +
    'To enable auth & sync, create .env.local with your Firebase credentials.\n' +
    'See .env.example for details.'
  );
}

const analytics = typeof window !== 'undefined' && _app ? getAnalytics(_app) : null;

// Export with non-null types — safe because:
// 1. useAuth guards with !auth → returns no user → userId is null
// 2. All Firestore hooks guard with !userId → never call db when unconfigured
const app = _app as FirebaseApp;
const auth = _auth as Auth;
const db = _db as Firestore;

export const loginWithGoogle = async () => {
  if (!_auth) throw new Error('Firebase no está configurado. Crea .env.local con tus credenciales.');
  const googleProvider = new GoogleAuthProvider();
  return signInWithPopup(_auth, googleProvider);
};

export const logoutFirebase = async () => {
  if (!_auth) return;
  return signOut(_auth);
};

export { app, analytics, auth, db };

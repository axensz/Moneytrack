import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    '🔥 Firebase configuration is missing!\n\n' +
    'Please follow these steps:\n' +
    '1. Go to https://console.firebase.google.com\n' +
    '2. Select your project: "moneytrack-889fe"\n' +
    '3. Click ⚙️ > Project settings > Your apps\n' +
    '4. Copy your Firebase config values\n' +
    '5. Update the .env.local file with real credentials\n\n' +
    'See .env.local for detailed instructions.'
  );
}

// Detect placeholder/dummy values
const isDummyConfig = 
  firebaseConfig.apiKey.includes('YOUR_') || 
  firebaseConfig.apiKey.includes('Dummy') ||
  firebaseConfig.apiKey.length < 30;

if (isDummyConfig) {
  throw new Error(
    '🔥 Firebase API key is invalid!\n\n' +
    'You are using a placeholder API key. Please:\n' +
    '1. Open .env.local file\n' +
    '2. Replace placeholder values with real Firebase credentials\n' +
    '3. Get your credentials from: https://console.firebase.google.com\n\n' +
    'Current API key: ' + firebaseConfig.apiKey.substring(0, 20) + '...'
  );
}

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);

// Firestore con persistencia offline nativa
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logoutFirebase = () => signOut(auth);
export { app, analytics, auth, db };
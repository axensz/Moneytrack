import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "",
  authDomain: "moneytrack-889fe.firebaseapp.com",
  projectId: "moneytrack-889fe",
  storageBucket: "moneytrack-889fe.firebasestorage.app",
  messagingSenderId: "319647072250",
  appId: "1:319647072250:web:f664bfa98a3890185f2e43",
  measurementId: "G-QVPGHKX7EM"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logoutFirebase = () => signOut(auth);
export { app, analytics, auth, db };
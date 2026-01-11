import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "",
  authDomain: "moneytrack-889fe.firebaseapp.com",
  projectId: "moneytrack-889fe",
  storageBucket: "moneytrack-889fe.firebasestorage.app",
  messagingSenderId: "319647072250",
  appId: "1:319647072250:web:f664bfa98a3890185f2e43",
  measurementId: "G-QVPGHKX7EM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { app, analytics };
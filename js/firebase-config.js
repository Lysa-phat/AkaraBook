import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBplZv3S900oPhTg6RDqjARbA8Hw8KmZ5c",
  authDomain: "akarabook-service.firebaseapp.com",
  projectId: "akarabook-service",
  storageBucket: "akarabook-service.firebasestorage.app",
  messagingSenderId: "1092499956360",
  appId: "1:1092499956360:web:d55e6c1e98e853ffba753d",
  measurementId: "G-0WN68Z3YSK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

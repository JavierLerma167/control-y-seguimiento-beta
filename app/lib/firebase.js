import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// 🔴 IMPORTANTE: REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO EN FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyDJgz5ejfblZ63eAER5BMT4SYvvmYbw1xk",
  authDomain: "control-y-seguimiento-c81b3.firebaseapp.com",
  projectId: "control-y-seguimiento-c81b3",
  storageBucket: "control-y-seguimiento-c81b3.firebasestorage.app",
  messagingSenderId: "397563523539",
  appId: "1:397563523539:web:f0c9ab030a5391d5cc7f26",
  measurementId: "G-HFLJX8NCN6"
};

// Inicializar Firebase (evita reinicializar en desarrollo)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage };
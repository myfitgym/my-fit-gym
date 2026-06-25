import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Credenciales oficiales de My Fit Gym Rodeo
const firebaseConfig = {
  apiKey: "AIzaSyDUhd9pXro6bTLIFPp1XPVwUn-c8F3pYMc",
  authDomain: "my-fit-gym-rodeo.firebaseapp.com",
  projectId: "my-fit-gym-rodeo",
  storageBucket: "my-fit-gym-rodeo.firebasestorage.app",
  messagingSenderId: "263351409781",
  appId: "1:263351409781:web:3dbdc182823949ac5d2c3c",
  measurementId: "G-32S154LZ1G"
};

// Inicializar la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore con persistencia offline en IndexedDB
export const db = getFirestore(app);
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence no disponible: múltiples pestañas abiertas.');
  } else if (err.code === 'unimplemented') {
    console.warn('El navegador no soporta IndexedDB persistence.');
  } else {
    console.warn('No se pudo habilitar persistencia offline:', err);
  }
});

// Exportar servicios para usarlos en tus pantallas
export const auth = getAuth(app);
export const storage = getStorage(app);
"use client";
import { createContext, useContext, useEffect } from 'react';
import { useFirestore } from '../hooks/useFirestore';

const FirebaseContext = createContext(null);

export function FirebaseProvider({ children }) {
  const firestore = useFirestore();
  
  useEffect(() => {
    const migrado = localStorage.getItem('firebase_migrado');
    if (!migrado && firestore.usuario?.rol === 'admin' && !firestore.cargando) {
      firestore.migrarDesdeLocalStorage().then(cantidad => {
        if (cantidad > 0) {
          localStorage.setItem('firebase_migrado', 'true');
          console.log(`✅ Migrados ${cantidad} documentos a Firebase`);
        }
      });
    }
  }, [firestore.usuario, firestore.cargando]);
  
  return (
    <FirebaseContext.Provider value={firestore}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase debe usarse dentro de FirebaseProvider');
  }
  return context;
}
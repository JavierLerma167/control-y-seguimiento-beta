"use client";
import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  setDoc,
  limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Colecciones definidas
export const COLLECTIONS = {
  USUARIOS: 'usuarios',
  CLIENTES: 'clientes',
  PAQUETES: 'paquetes',
  VENTAS: 'ventas',
  AGENDA: 'agenda',
  PEDIDOS: 'pedidos',
  INSTITUCIONES: 'instituciones',
  TAREAS: 'tareas',
  NOTIFICACIONES: 'notificaciones',
  FINANZAS: 'finanzas',
  LOGS: 'logs'
};

// Permisos por rol
const PERMISOS = {
  admin: {
    leer: true, crear: true, editar: true, eliminar: true
  },
  empleado: {
    leer: true, crear: true, editar: true, eliminar: false
  }
};

export function useFirestore() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // Autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, COLLECTIONS.USUARIOS, user.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};
          setUsuario({
            id: user.uid,
            email: user.email,
            nombre: userData.nombre || user.email,
            rol: userData.rol || 'empleado',
            ...userData
          });
        } catch (error) {
          console.error('Error cargando usuario:', error);
          setUsuario({
            id: user.uid,
            email: user.email,
            nombre: user.email,
            rol: 'empleado'
          });
        }
      } else {
        setUsuario(null);
      }
      setCargando(false);
    });
    return () => unsubscribe();
  }, []);

  // Verificar permisos
  const verificarPermiso = useCallback((coleccion, accion) => {
    if (!usuario) return false;
    const permisoRol = PERMISOS[usuario.rol];
    if (!permisoRol) return false;
    return permisoRol[accion] || false;
  }, [usuario]);

  // Leer todos los documentos
  const leerTodos = useCallback(async (coleccion, condiciones = null) => {
    if (!verificarPermiso(coleccion, 'leer')) {
      console.warn('Sin permisos para leer', coleccion);
      return [];
    }
    
    try {
      let q = collection(db, coleccion);
      if (condiciones) {
        const { campo, operador, valor, ordenarPor, limite: limiteNum } = condiciones;
        if (campo && operador && valor !== undefined) {
          q = query(q, where(campo, operador, valor));
        }
        if (ordenarPor) {
          q = query(q, orderBy(ordenarPor.campo, ordenarPor.direccion || 'asc'));
        }
        if (limiteNum) {
          q = query(q, limit(limiteNum));
        }
      }
      const querySnapshot = await getDocs(q);
      const documentos = [];
      querySnapshot.forEach(doc => {
        documentos.push({ id: doc.id, ...doc.data() });
      });
      return documentos;
    } catch (error) {
      console.error('Error leyendo documentos:', error);
      return [];
    }
  }, [verificarPermiso]);

  // Leer un documento
  const leer = useCallback(async (coleccion, id) => {
    if (!verificarPermiso(coleccion, 'leer')) {
      return null;
    }
    
    try {
      const docRef = doc(db, coleccion, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error leyendo documento:', error);
      return null;
    }
  }, [verificarPermiso]);

  // Crear documento
  const crear = useCallback(async (coleccion, datos, idPersonalizado = null) => {
    if (!verificarPermiso(coleccion, 'crear')) {
      throw new Error('No tienes permisos para crear en esta colección');
    }
    
    try {
      const datosCompletos = {
        ...datos,
        creadoPor: usuario?.id,
        creadoPorNombre: usuario?.nombre,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp()
      };
      
      let docRef;
      if (idPersonalizado) {
        docRef = doc(db, coleccion, idPersonalizado);
        await setDoc(docRef, datosCompletos);
      } else {
        docRef = await addDoc(collection(db, coleccion), datosCompletos);
      }
      
      return { id: docRef.id, ...datosCompletos };
    } catch (error) {
      console.error('Error creando documento:', error);
      return null;
    }
  }, [usuario, verificarPermiso]);

  // Actualizar documento
  const actualizar = useCallback(async (coleccion, id, datos) => {
    if (!verificarPermiso(coleccion, 'editar')) {
      throw new Error('No tienes permisos para editar esta colección');
    }
    
    try {
      const docRef = doc(db, coleccion, id);
      const datosActualizados = {
        ...datos,
        actualizadoPor: usuario?.id,
        actualizadoPorNombre: usuario?.nombre,
        actualizadoEn: serverTimestamp()
      };
      await updateDoc(docRef, datosActualizados);
      return true;
    } catch (error) {
      console.error('Error actualizando documento:', error);
      return false;
    }
  }, [usuario, verificarPermiso]);

  // Eliminar documento
  const eliminar = useCallback(async (coleccion, id) => {
    if (!verificarPermiso(coleccion, 'eliminar')) {
      throw new Error('No tienes permisos para eliminar en esta colección');
    }
    
    try {
      const docRef = doc(db, coleccion, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error eliminando documento:', error);
      return false;
    }
  }, [verificarPermiso]);

  // Suscripción en tiempo real
  const suscribir = useCallback((coleccion, callback, condiciones = null) => {
    if (!verificarPermiso(coleccion, 'leer')) {
      callback([]);
      return () => {};
    }
    
    try {
      let q = collection(db, coleccion);
      if (condiciones) {
        const { campo, operador, valor, ordenarPor, limite: limiteNum } = condiciones;
        if (campo && operador && valor !== undefined) {
          q = query(q, where(campo, operador, valor));
        }
        if (ordenarPor) {
          q = query(q, orderBy(ordenarPor.campo, ordenarPor.direccion || 'asc'));
        }
        if (limiteNum) {
          q = query(q, limit(limiteNum));
        }
      }
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const documentos = [];
        snapshot.forEach(doc => {
          documentos.push({ id: doc.id, ...doc.data() });
        });
        callback(documentos);
      }, (error) => {
        console.error('Error en suscripción:', error);
        callback([]);
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error creando suscripción:', error);
      callback([]);
      return () => {};
    }
  }, [verificarPermiso]);

  // Migrar datos desde localStorage
  const migrarDesdeLocalStorage = useCallback(async () => {
    setSincronizando(true);
    const mapping = {
      'registros_asistentes': COLLECTIONS.CLIENTES,
      'registros_ventas': COLLECTIONS.VENTAS,
      'registros_agenda': COLLECTIONS.AGENDA,
      'planilla_fotografica_v4': COLLECTIONS.PEDIDOS,
      'catalogo_pro_v3': COLLECTIONS.PAQUETES,
      'db_usuarios': COLLECTIONS.USUARIOS,
      'db_tareas': COLLECTIONS.TAREAS,
      'db_notificaciones': COLLECTIONS.NOTIFICACIONES,
      'db_finanzas': COLLECTIONS.FINANZAS
    };
    
    let migrados = 0;
    for (const [localKey, coleccion] of Object.entries(mapping)) {
      const data = localStorage.getItem(localKey);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              await crear(coleccion, item, item.id?.toString());
              migrados++;
            }
          } else if (typeof parsed === 'object') {
            await crear(coleccion, parsed, parsed.id?.toString());
            migrados++;
          }
        } catch (e) {
          console.error(`Error migrando ${localKey}:`, e);
        }
      }
    }
    setSincronizando(false);
    return migrados;
  }, [crear]);

  return {
    usuario,
    cargando,
    sincronizando,
    verificarPermiso,
    leerTodos,
    leer,
    crear,
    actualizar,
    eliminar,
    suscribir,
    migrarDesdeLocalStorage,
    COLLECTIONS
  };
}
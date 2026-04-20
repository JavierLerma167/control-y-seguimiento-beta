// app/hooks/useFirestore.js
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
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
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';

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
  LOGS: 'logs',
  COLA_ACREDITACION: 'cola_acreditacion',
  PRODUCTIVIDAD: 'productividad',
  NOTAS_OPERACIONES: 'notas_operaciones'
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
  const [notificaciones, setNotificaciones] = useState([]);
  const migracionRealizadaRef = useRef(false);

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
            activo: userData.activo !== false,
            permisos: userData.permisos || {},
            ...userData
          });
        } catch (error) {
          console.error('Error cargando usuario:', error);
          setUsuario({
            id: user.uid,
            email: user.email,
            nombre: user.email,
            rol: 'empleado',
            activo: true
          });
        }
      } else {
        setUsuario(null);
        setNotificaciones([]);
      }
      setCargando(false);
    });
    return () => unsubscribe();
  }, []);

  // Suscribirse a notificaciones del usuario
  useEffect(() => {
    if (!usuario?.id) return;

    const q = query(
      collection(db, COLLECTIONS.NOTIFICACIONES),
      where('usuarioId', '==', usuario.id),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notis = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotificaciones(notis);
    });

    return () => unsubscribe();
  }, [usuario?.id]);

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

  // ============ NUEVAS FUNCIONES ============

  // Crear usuario (solo admin)
  const crearUsuario = useCallback(async (email, password, nombre, rol, permisos = {}) => {
    if (usuario?.rol !== 'admin') {
      throw new Error('Solo administradores pueden crear usuarios');
    }
    
    try {
      // Crear usuario en Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Guardar datos en Firestore
      await setDoc(doc(db, COLLECTIONS.USUARIOS, user.uid), {
        uid: user.uid,
        email,
        nombre,
        rol,
        activo: true,
        permisos: {
          puedeVerOperaciones: rol === 'empleado',
          puedeEditarPedidos: rol === 'admin',
          puedeVerFinanzas: rol === 'admin',
          ...permisos
        },
        fechaRegistro: Timestamp.now(),
        fechaRegistroISO: new Date().toISOString()
      });
      
      // Crear registro de productividad inicial
      await setDoc(doc(db, COLLECTIONS.PRODUCTIVIDAD, user.uid), {
        usuarioId: user.uid,
        nombre,
        tareasCompletadas: 0,
        tiempoTotal: 0,
        ultimaActividad: null,
        historialDiario: []
      });
      
      return { success: true, user };
    } catch (error) {
      console.error('Error creando usuario:', error);
      return { success: false, error: error.message };
    }
  }, [usuario]);

  // Habilitar/Deshabilitar usuario (solo admin)
  const toggleUsuarioActivo = useCallback(async (usuarioId, activo) => {
    if (usuario?.rol !== 'admin') {
      throw new Error('Solo administradores pueden modificar usuarios');
    }
    
    try {
      await updateDoc(doc(db, COLLECTIONS.USUARIOS, usuarioId), {
        activo,
        fechaActualizacion: Timestamp.now(),
        actualizadoPor: usuario.nombre
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error toggling usuario:', error);
      return { success: false, error: error.message };
    }
  }, [usuario]);

  // Registrar productividad de empleado
  const registrarProductividad = useCallback(async (usuarioId, tareaId, paso, tiempoDedicado = 0) => {
    try {
      const productividadRef = doc(db, COLLECTIONS.PRODUCTIVIDAD, usuarioId);
      const productividadDoc = await getDoc(productividadRef);
      
      const hoy = new Date().toISOString().split('T')[0];
      const ahora = Timestamp.now();
      
      if (productividadDoc.exists()) {
        const data = productividadDoc.data();
        let historialDiario = data.historialDiario || [];
        
        const indexHoy = historialDiario.findIndex(h => h.fecha === hoy);
        
        if (indexHoy !== -1) {
          historialDiario[indexHoy].actividades.push({
            tareaId,
            paso,
            timestamp: ahora,
            tiempo: tiempoDedicado
          });
          historialDiario[indexHoy].totalActividades++;
          historialDiario[indexHoy].tiempoTotal = (historialDiario[indexHoy].tiempoTotal || 0) + tiempoDedicado;
        } else {
          historialDiario.push({
            fecha: hoy,
            totalActividades: 1,
            tiempoTotal: tiempoDedicado,
            actividades: [{
              tareaId,
              paso,
              timestamp: ahora,
              tiempo: tiempoDedicado
            }]
          });
        }
        
        await updateDoc(productividadRef, {
          ultimaActividad: ahora,
          historialDiario,
          [`estadisticas.${paso}`]: (data.estadisticas?.[paso] || 0) + 1
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error registrando productividad:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Agregar múltiples fechas a un grupo en pedidos
  const agregarFechaGrupo = useCallback(async (pedidoId, grupoId, nuevaFecha, tipoFecha = 'sesion') => {
    try {
      const pedidosData = await leerTodos(COLLECTIONS.PEDIDOS);
      if (!pedidosData || pedidosData.length === 0) return false;
      
      const pedidoDoc = pedidosData[0];
      const nuevasInstituciones = pedidoDoc.instituciones.map(inst => ({
        ...inst,
        grupos: inst.grupos?.map(g => {
          if (g.id === grupoId) {
            const fechasActuales = g.fechas || [];
            return {
              ...g,
              fechas: [...fechasActuales, {
                id: Date.now().toString(),
                fecha: nuevaFecha,
                tipo: tipoFecha,
                registradoPor: usuario?.nombre,
                registradoEn: new Date().toISOString()
              }]
            };
          }
          return g;
        })
      }));
      
      await actualizar(COLLECTIONS.PEDIDOS, pedidoDoc.id, { instituciones: nuevasInstituciones });
      return true;
    } catch (error) {
      console.error('Error agregando fecha al grupo:', error);
      return false;
    }
  }, [usuario, leerTodos, actualizar]);

  // Crear notificación
  const crearNotificacion = useCallback(async (notificacion) => {
    try {
      const nuevaNotificacion = {
        usuarioId: notificacion.usuarioId,
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        prioridad: notificacion.prioridad || 'media',
        leida: false,
        fecha: new Date().toLocaleString(),
        fechaISO: new Date().toISOString(),
        timestamp: Timestamp.now(),
        creadoPor: usuario?.id,
        creadoPorNombre: usuario?.nombre,
        enlace: notificacion.enlace || null
      };
      
      const docRef = await addDoc(collection(db, COLLECTIONS.NOTIFICACIONES), nuevaNotificacion);
      return { id: docRef.id, ...nuevaNotificacion };
    } catch (error) {
      console.error('Error creando notificación:', error);
      return null;
    }
  }, [usuario]);

  // Marcar notificación como leída
  const marcarNotificacionLeida = useCallback(async (notificacionId) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.NOTIFICACIONES, notificacionId), {
        leida: true,
        fechaLeida: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error marcando notificación:', error);
      return false;
    }
  }, []);

  // Obtener productividad por empleado
  const getProductividadEmpleado = useCallback(async (usuarioId, fechaInicio, fechaFin) => {
    try {
      const productividadDoc = await getDoc(doc(db, COLLECTIONS.PRODUCTIVIDAD, usuarioId));
      if (!productividadDoc.exists()) return null;
      
      const data = productividadDoc.data();
      const historial = data.historialDiario || [];
      
      // Filtrar por rango de fechas
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      
      const filtrado = historial.filter(h => {
        const fecha = new Date(h.fecha);
        return fecha >= inicio && fecha <= fin;
      });
      
      return {
        nombre: data.nombre,
        totalActividades: filtrado.reduce((sum, d) => sum + d.totalActividades, 0),
        tiempoTotal: filtrado.reduce((sum, d) => sum + (d.tiempoTotal || 0), 0),
        historial: filtrado,
        estadisticas: data.estadisticas || {}
      };
    } catch (error) {
      console.error('Error obteniendo productividad:', error);
      return null;
    }
  }, []);

  // Obtener todas las notificaciones del usuario
  const getMisNotificaciones = useCallback(() => {
    return notificaciones;
  }, [notificaciones]);

  // Obtener notificaciones no leídas
  const getNotificacionesNoLeidas = useCallback(() => {
    return notificaciones.filter(n => !n.leida);
  }, [notificaciones]);

  // Migrar datos desde localStorage
  const migrarDesdeLocalStorage = useCallback(async () => {
    if (migracionRealizadaRef.current) {
      console.log('Migración ya realizada previamente');
      return 0;
    }
    
    const yaMigrado = localStorage.getItem('firebase_migracion_completa');
    if (yaMigrado === 'true') {
      console.log('Migración ya completada en sesión anterior');
      migracionRealizadaRef.current = true;
      return 0;
    }
    
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
              const existe = await leerTodos(coleccion, {
                campo: 'id',
                operador: '==',
                valor: item.id?.toString()
              });
              if (!existe || existe.length === 0) {
                await crear(coleccion, item, item.id?.toString());
                migrados++;
              }
            }
          } else if (typeof parsed === 'object') {
            const existe = await leerTodos(coleccion, {
              campo: 'id',
              operador: '==',
              valor: parsed.id?.toString()
            });
            if (!existe || existe.length === 0) {
              await crear(coleccion, parsed, parsed.id?.toString());
              migrados++;
            }
          }
        } catch (e) {
          console.error(`Error migrando ${localKey}:`, e);
        }
      }
    }
    
    if (migrados > 0) {
      localStorage.setItem('firebase_migracion_completa', 'true');
      migracionRealizadaRef.current = true;
    }
    
    setSincronizando(false);
    return migrados;
  }, [crear, leerTodos]);

  // Cerrar sesión
  const cerrarSesion = useCallback(async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('session_active');
      localStorage.removeItem('session_user');
      localStorage.removeItem('firebase_migracion_completa');
      return true;
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      return false;
    }
  }, []);

  return {
    usuario,
    cargando,
    sincronizando,
    notificaciones,
    verificarPermiso,
    leerTodos,
    leer,
    crear,
    actualizar,
    eliminar,
    suscribir,
    migrarDesdeLocalStorage,
    cerrarSesion,
    logout: cerrarSesion,
    signOut: cerrarSesion,
    crearUsuario,
    toggleUsuarioActivo,
    registrarProductividad,
    agregarFechaGrupo,
    crearNotificacion,
    marcarNotificacionLeida,
    getProductividadEmpleado,
    getMisNotificaciones,
    getNotificacionesNoLeidas,
    COLLECTIONS
  };
}
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

export function useTasks() {
  const db = useFirebase();
  const [tareas, setTareas] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [tareasPendientes, setTareasPendientes] = useState(0);
  
  const initialLoadDone = useRef(false);
  const isMounted = useRef(true);

  // ============ FUNCIÓN INTERNA DE NOTIFICACIONES (DEFINIDA PRIMERO) ============
  const crearNotificacionInterna = useCallback(async (notificacion) => {
    if (!db.usuario) return null;
    
    const nuevaNotificacion = {
      usuarioId: notificacion.usuarioId,
      tipo: notificacion.tipo,
      tareaId: notificacion.tareaId,
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      prioridad: notificacion.prioridad || 'media',
      leida: false,
      fecha: new Date().toLocaleString(),
      fechaISO: new Date().toISOString(),
      creadoPor: db.usuario.id,
      creadoPorNombre: db.usuario.nombre
    };

    const notificacionCreada = await db.crear(db.COLLECTIONS.NOTIFICACIONES, nuevaNotificacion);
    
    if (notificacionCreada && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nuevaNotificacion', { 
        detail: notificacionCreada 
      }));
    }
    
    return notificacionCreada;
  }, [db]);

  // ============ CARGAR TAREAS Y NOTIFICACIONES ============
  useEffect(() => {
    if (!db.usuario) return;

    // Suscribirse a cambios en tareas
    const unsubscribeTareas = db.suscribir(db.COLLECTIONS.TAREAS, (data) => {
      if (isMounted.current && data) {
        setTareas(data);
        
        // Calcular tareas pendientes del usuario actual
        const pendientes = data.filter(t => 
          t.asignadoA === db.usuario?.id && 
          t.estado === 'pendiente'
        ).length;
        setTareasPendientes(pendientes);
      }
    });

    // Suscribirse a cambios en notificaciones
    const unsubscribeNotificaciones = db.suscribir(db.COLLECTIONS.NOTIFICACIONES, (data) => {
      if (isMounted.current && data) {
        const noLeidas = data.filter(n => n.usuarioId === db.usuario?.id && !n.leida);
        setNotificaciones(noLeidas);
      }
    });
    
    initialLoadDone.current = true;

    return () => {
      isMounted.current = false;
      unsubscribeTareas();
      unsubscribeNotificaciones();
    };
  }, [db.usuario, db]);

  // ============ CREAR TAREA (SOLO ADMIN) ============
  const crearTarea = useCallback(async (tarea) => {
    if (db.usuario?.rol !== 'admin') {
      console.warn('Solo los administradores pueden crear tareas');
      return null;
    }

    if (!tarea.titulo || !tarea.asignadoA) {
      console.error('Título y asignado son requeridos');
      return null;
    }

    const nuevaTarea = {
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || '',
      asignadoA: tarea.asignadoA,
      asignadoPor: db.usuario.id,
      asignadoPorNombre: db.usuario.nombre,
      fechaAsignacion: new Date().toLocaleString(),
      fechaAsignacionISO: new Date().toISOString(),
      fechaLimite: tarea.fechaLimite || null,
      prioridad: tarea.prioridad || 'media',
      estado: 'pendiente',
      fechaCompletada: null,
      notas: [],
      comentarios: []
    };

    const tareaCreada = await db.crear(db.COLLECTIONS.TAREAS, nuevaTarea);
    
    if (tareaCreada) {
      // Crear notificación para el empleado usando la función interna
      await crearNotificacionInterna({
        usuarioId: tarea.asignadoA,
        tipo: 'nueva_tarea',
        tareaId: tareaCreada.id,
        titulo: 'Nueva tarea asignada',
        mensaje: `${db.usuario.nombre} te ha asignado: "${tarea.titulo}"`,
        prioridad: tarea.prioridad
      });
    }

    return tareaCreada;
  }, [db, crearNotificacionInterna]);

  // ============ ACTUALIZAR ESTADO DE TAREA ============
  const actualizarEstadoTarea = useCallback(async (tareaId, nuevoEstado) => {
    const tarea = tareas.find(t => t.id === tareaId);
    if (!tarea) return false;

    // Verificar permisos
    if (nuevoEstado === 'completada' && tarea.asignadoA !== db.usuario?.id && db.usuario?.rol !== 'admin') {
      console.warn('No tienes permiso para completar esta tarea');
      return false;
    }

    const cambios = { estado: nuevoEstado };

    if (nuevoEstado === 'completada') {
      cambios.fechaCompletada = new Date().toLocaleString();
      cambios.fechaCompletadaISO = new Date().toISOString();
      
      // Notificar al jefe que la tarea está completa
      if (tarea.asignadoPor) {
        await crearNotificacionInterna({
          usuarioId: tarea.asignadoPor,
          tipo: 'tarea_completada',
          tareaId: tarea.id,
          titulo: 'Tarea completada',
          mensaje: `${db.usuario?.nombre || 'Alguien'} ha completado: "${tarea.titulo}"`,
          prioridad: tarea.prioridad
        });
      }
    }

    const exito = await db.actualizar(db.COLLECTIONS.TAREAS, tareaId, cambios);
    
    if (exito) {
      // Actualizar contador de pendientes localmente
      if (nuevoEstado === 'completada' && tarea.asignadoA === db.usuario?.id) {
        setTareasPendientes(prev => Math.max(0, prev - 1));
      } else if (nuevoEstado === 'pendiente' && tarea.asignadoA === db.usuario?.id) {
        setTareasPendientes(prev => prev + 1);
      }
    }

    return exito;
  }, [tareas, db, crearNotificacionInterna]);

  // ============ ELIMINAR TAREA (SOLO ADMIN) ============
  const eliminarTarea = useCallback(async (tareaId) => {
    if (db.usuario?.rol !== 'admin') {
      console.warn('Solo los administradores pueden eliminar tareas');
      return false;
    }

    const tarea = tareas.find(t => t.id === tareaId);
    if (!tarea) return false;

    if (!confirm('¿Estás seguro de eliminar esta tarea? Esta acción no se puede deshacer.')) {
      return false;
    }

    try {
      const exito = await db.eliminar(db.COLLECTIONS.TAREAS, tareaId);
      
      if (exito) {
        // Actualizar contador de pendientes si era una tarea pendiente del usuario actual
        if (tarea.asignadoA === db.usuario?.id && tarea.estado === 'pendiente') {
          setTareasPendientes(prev => Math.max(0, prev - 1));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      return false;
    }
  }, [db, tareas]);

  // ============ EDITAR TAREA (SOLO ADMIN) ============
  const editarTarea = useCallback(async (tareaId, datosActualizados) => {
    if (db.usuario?.rol !== 'admin') {
      console.warn('Solo los administradores pueden editar tareas');
      return false;
    }

    try {
      const cambios = {
        titulo: datosActualizados.titulo,
        descripcion: datosActualizados.descripcion,
        asignadoA: datosActualizados.asignadoA,
        prioridad: datosActualizados.prioridad,
        fechaLimite: datosActualizados.fechaLimite,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: db.usuario?.nombre,
        actualizadoPorId: db.usuario?.id
      };

      const exito = await db.actualizar(db.COLLECTIONS.TAREAS, tareaId, cambios);
      
      if (exito && datosActualizados.asignadoA) {
        // Notificar al nuevo asignado
        await crearNotificacionInterna({
          usuarioId: datosActualizados.asignadoA,
          tipo: 'tarea_actualizada',
          tareaId: tareaId,
          titulo: 'Tarea actualizada',
          mensaje: `${db.usuario?.nombre} ha actualizado la tarea: "${datosActualizados.titulo}"`,
          prioridad: datosActualizados.prioridad
        });
      }
      
      return exito;
    } catch (error) {
      console.error('Error editando tarea:', error);
      return false;
    }
  }, [db, crearNotificacionInterna]);

  // ============ MARCAR NOTIFICACIÓN COMO LEÍDA ============
  const marcarNotificacionLeida = useCallback(async (notificacionId) => {
    const exito = await db.actualizar(db.COLLECTIONS.NOTIFICACIONES, notificacionId, { leida: true });
    if (exito) {
      setNotificaciones(prev => prev.filter(n => n.id !== notificacionId));
    }
    return exito;
  }, [db]);

  // ============ OBTENER MIS TAREAS ============
  const getMisTareas = useCallback(() => {
    if (!db.usuario) return [];
    return tareas
      .filter(t => t.asignadoA === db.usuario.id)
      .sort((a, b) => {
        // Pendientes primero
        if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
        if (a.estado !== 'pendiente' && b.estado === 'pendiente') return 1;
        // Por prioridad
        const prioridadPeso = { alta: 0, media: 1, baja: 2 };
        return prioridadPeso[a.prioridad] - prioridadPeso[b.prioridad];
      });
  }, [tareas, db.usuario]);

  // ============ OBTENER MIS TAREAS PENDIENTES ============
  const getMisTareasPendientes = useCallback(() => {
    return getMisTareas().filter(t => t.estado === 'pendiente');
  }, [getMisTareas]);

  // ============ OBTENER ESTADÍSTICAS ============
  const getEstadisticasTareas = useCallback(() => {
    const todas = tareas;
    const misTareas = getMisTareas();
    
    return {
      global: {
        total: todas.length,
        pendientes: todas.filter(t => t.estado === 'pendiente').length,
        completadas: todas.filter(t => t.estado === 'completada').length
      },
      personales: {
        total: misTareas.length,
        pendientes: misTareas.filter(t => t.estado === 'pendiente').length,
        completadas: misTareas.filter(t => t.estado === 'completada').length
      }
    };
  }, [tareas, getMisTareas]);

  return {
    // Datos
    tareas,
    notificaciones,
    tareasPendientes,
    
    // Operaciones principales
    crearTarea,
    actualizarEstadoTarea,
    eliminarTarea,
    editarTarea,
    marcarNotificacionLeida,
    
    // Consultas
    getMisTareas,
    getMisTareasPendientes,
    getEstadisticasTareas
  };
}
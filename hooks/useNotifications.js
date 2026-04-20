// app/hooks/useNotifications.js
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

export function useNotifications() {
  const db = useFirebase();
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const isMounted = useRef(true);

  // Suscribirse a notificaciones del usuario actual
  useEffect(() => {
    if (!db.usuario) return;

    const unsubscribe = db.suscribir(db.COLLECTIONS.NOTIFICACIONES, (data) => {
      if (isMounted.current && data) {
        // Filtrar solo notificaciones del usuario actual
        const misNotificaciones = data.filter(n => n.usuarioId === db.usuario.id);
        // Ordenar por fecha (más recientes primero)
        misNotificaciones.sort((a, b) => 
          new Date(b.fechaISO) - new Date(a.fechaISO)
        );
        setNotificaciones(misNotificaciones);
        setNoLeidas(misNotificaciones.filter(n => !n.leida).length);
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [db.usuario, db]);

  // Marcar notificación como leída
  const marcarComoLeida = useCallback(async (notificacionId) => {
    const exito = await db.actualizar(db.COLLECTIONS.NOTIFICACIONES, notificacionId, { 
      leida: true,
      fechaLeida: new Date().toISOString()
    });
    if (exito) {
      setNotificaciones(prev => 
        prev.map(n => n.id === notificacionId ? { ...n, leida: true } : n)
      );
      setNoLeidas(prev => Math.max(0, prev - 1));
    }
    return exito;
  }, [db]);

  // Marcar todas como leídas
  const marcarTodasComoLeidas = useCallback(async () => {
    const noLeidasList = notificaciones.filter(n => !n.leida);
    let exito = true;
    for (const notif of noLeidasList) {
      const result = await db.actualizar(db.COLLECTIONS.NOTIFICACIONES, notif.id, { 
        leida: true,
        fechaLeida: new Date().toISOString()
      });
      if (!result) exito = false;
    }
    if (exito) {
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
      setNoLeidas(0);
    }
    return exito;
  }, [db, notificaciones]);

  // Eliminar notificación
  const eliminarNotificacion = useCallback(async (notificacionId) => {
    const exito = await db.eliminar(db.COLLECTIONS.NOTIFICACIONES, notificacionId);
    if (exito) {
      const notifEliminada = notificaciones.find(n => n.id === notificacionId);
      setNotificaciones(prev => prev.filter(n => n.id !== notificacionId));
      if (notifEliminada && !notifEliminada.leida) {
        setNoLeidas(prev => Math.max(0, prev - 1));
      }
    }
    return exito;
  }, [db, notificaciones]);

  // Crear notificación (para usar internamente)
  const crearNotificacion = useCallback(async (notificacion) => {
    if (!db.usuario) return null;

    const nuevaNotificacion = {
      usuarioId: notificacion.usuarioId,
      tipo: notificacion.tipo,
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      prioridad: notificacion.prioridad || 'media',
      leida: false,
      fecha: new Date().toLocaleString(),
      fechaISO: new Date().toISOString(),
      creadoPor: db.usuario.id,
      creadoPorNombre: db.usuario.nombre,
      enlace: notificacion.enlace || null
    };

    return await db.crear(db.COLLECTIONS.NOTIFICACIONES, nuevaNotificacion);
  }, [db]);

  return {
    notificaciones,
    noLeidas,
    marcarComoLeida,
    marcarTodasComoLeidas,
    eliminarNotificacion,
    crearNotificacion
  };
}
// app/components/NotificacionesGlobales.js
"use client";
import { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

export default function NotificacionesGlobales() {
  const { usuario, notificaciones, marcarNotificacionLeida, crearNotificacion } = useFirebase();
  const [mostrar, setMostrar] = useState(false);
  const [notis, setNotis] = useState([]);

  useEffect(() => {
    if (usuario && notificaciones) {
      setNotis(notificaciones.filter(n => n.usuarioId === usuario.id));
    }
  }, [usuario, notificaciones]);

  const noLeidas = notis.filter(n => !n.leida).length;

  const handleMarcarLeida = async (id) => {
    await marcarNotificacionLeida(id);
    setNotis(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
  };

  const getColorPorTipo = (tipo) => {
    switch(tipo) {
      case 'nueva_tarea': return 'bg-blue-100 border-blue-200';
      case 'tarea_completada': return 'bg-green-100 border-green-200';
      case 'pedido_completado': return 'bg-purple-100 border-purple-200';
      case 'gasto_registrado': return 'bg-orange-100 border-orange-200';
      case 'estado_usuario': return 'bg-red-100 border-red-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  if (!usuario) return null;

  return (
    <>
      <button
        onClick={() => setMostrar(!mostrar)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <span className="text-lg">🔔</span>
        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {mostrar && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setMostrar(false)} />
          <div className="fixed top-16 right-4 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-[70vh] overflow-hidden">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-sm font-medium">Notificaciones</h3>
              <button onClick={() => setMostrar(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {notis.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">No hay notificaciones</div>
              ) : (
                notis.map(notif => (
                  <div key={notif.id} className={`p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!notif.leida ? 'bg-blue-50' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className={`inline-block text-[8px] px-2 py-0.5 rounded mb-1 ${getColorPorTipo(notif.tipo)}`}>
                          {notif.tipo?.replace(/_/g, ' ').toUpperCase()}
                        </div>
                        <p className="text-xs font-medium">{notif.titulo}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{notif.mensaje}</p>
                        <p className="text-[8px] text-gray-400 mt-1">{new Date(notif.fechaISO).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-1">
                        {!notif.leida && (
                          <button onClick={() => handleMarcarLeida(notif.id)} className="text-[8px] text-blue-500 hover:text-blue-700" title="Marcar como leída">✓</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
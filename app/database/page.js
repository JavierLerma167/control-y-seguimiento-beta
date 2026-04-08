// app/database/page.js
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

export default function DatabaseViewerPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    eliminar, 
    suscribir, 
    COLLECTIONS 
  } = useFirebase();
  
  const [activeTab, setActiveTab] = useState('clientes');
  const [datos, setDatos] = useState({});
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [vistaJSON, setVistaJSON] = useState(false);
  const [expandido, setExpandido] = useState(null);

  const isMounted = useRef(true);

  // Definición de todas las colecciones de Firebase
  const colecciones = [
    // Datos de clientes (accesibles para empleados)
    { id: 'clientes', nombre: 'Acreditaciones / Clientes', collection: COLLECTIONS.CLIENTES, tipo: 'cliente', requiereAdmin: false },
    { id: 'ventas', nombre: 'Ventas / Caja', collection: COLLECTIONS.VENTAS, tipo: 'cliente', requiereAdmin: false },
    { id: 'agenda', nombre: 'Agenda de Sesiones', collection: COLLECTIONS.AGENDA, tipo: 'cliente', requiereAdmin: false },
    { id: 'tareas', nombre: 'Tareas Asignadas', collection: COLLECTIONS.TAREAS, tipo: 'cliente', requiereAdmin: false },
    { id: 'paquetes', nombre: 'Catálogo de Paquetes', collection: COLLECTIONS.PAQUETES, tipo: 'cliente', requiereAdmin: false },
    { id: 'pedidos', nombre: 'Planilla de Pedidos', collection: COLLECTIONS.PEDIDOS, tipo: 'cliente', requiereAdmin: false },
    
    // Datos administrativos (solo admins)
    { id: 'usuarios', nombre: 'Usuarios del Sistema', collection: COLLECTIONS.USUARIOS, tipo: 'admin', requiereAdmin: true },
    { id: 'finanzas', nombre: 'Finanzas y Gastos', collection: COLLECTIONS.FINANZAS, tipo: 'admin', requiereAdmin: true },
    { id: 'notificaciones', nombre: 'Notificaciones', collection: COLLECTIONS.NOTIFICACIONES, tipo: 'admin', requiereAdmin: true },
    { id: 'logs', nombre: 'Logs de Actividad', collection: COLLECTIONS.LOGS, tipo: 'admin', requiereAdmin: true }
  ];

  const esAdmin = usuario?.rol === 'admin';

  // Filtrar colecciones según el rol del usuario
  const coleccionesPermitidas = useMemo(() => {
    if (!usuario) return [];
    if (esAdmin) return colecciones;
    
    // Empleados: solo colecciones que no requieren admin
    return colecciones.filter(col => !col.requiereAdmin);
  }, [usuario, esAdmin]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A LA COLECCIÓN ACTIVA ---
  useEffect(() => {
    if (!usuario) return;
    
    const coleccionActual = coleccionesPermitidas.find(c => c.id === activeTab);
    if (!coleccionActual) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(coleccionActual.collection, (data) => {
      if (isMounted.current) {
        setDatos(prev => ({ ...prev, [activeTab]: data || [] }));
        setCargado(true);
        setSincronizando(false);
      }
    });
    
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [usuario, activeTab, coleccionesPermitidas, suscribir]);

  // --- CARGAR DATOS INICIALES DE TODAS LAS COLECCIONES ---
  useEffect(() => {
    if (!usuario) return;
    
    const cargarTodasLasColecciones = async () => {
      const datosCargados = {};
      
      for (const col of coleccionesPermitidas) {
        try {
          const data = await leerTodos(col.collection);
          if (isMounted.current) {
            datosCargados[col.id] = data || [];
          }
        } catch (error) {
          console.error(`Error cargando ${col.id}:`, error);
          if (isMounted.current) {
            datosCargados[col.id] = [];
          }
        }
      }
      
      if (isMounted.current) {
        setDatos(datosCargados);
        setCargado(true);
      }
    };
    
    cargarTodasLasColecciones();
    
    return () => {
      isMounted.current = false;
    };
  }, [usuario, coleccionesPermitidas, leerTodos]);

  // --- OBTENER DATOS DE LA TABLA ACTIVA ---
  const datosActivos = useMemo(() => {
    return datos[activeTab] || [];
  }, [datos, activeTab]);

  // --- FUNCIÓN PARA FORMATEAR VALORES ---
  const formatearValor = useCallback((valor) => {
    if (valor === null || valor === undefined) return '-';
    if (typeof valor === 'boolean') return valor ? '✓' : '✗';
    if (typeof valor === 'object') {
      if (Array.isArray(valor)) {
        if (valor.length === 0) return '[]';
        return `[${valor.length} items]`;
      }
      if (Object.keys(valor).length === 0) return '{}';
      // Para Firestore Timestamps
      if (valor.toDate && typeof valor.toDate === 'function') {
        return valor.toDate().toLocaleString();
      }
      return '{...}';
    }
    if (typeof valor === 'string' && valor.length > 50) {
      return valor.substring(0, 50) + '...';
    }
    return String(valor);
  }, []);

  // --- OBTENER COLUMNAS ÚNICAS ---
  const obtenerColumnas = useCallback((data) => {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    const columnasSet = new Set();
    data.forEach(item => {
      Object.keys(item).forEach(key => {
        // Excluir campos muy largos o internos
        if (key !== '_totales' && key !== 'paqueteInfo') {
          columnasSet.add(key);
        }
      });
    });
    
    return Array.from(columnasSet);
  }, []);

  // --- FILTRAR DATOS POR BÚSQUEDA ---
  const datosFiltrados = useMemo(() => {
    const data = datosActivos;
    if (!Array.isArray(data) || !busqueda.trim()) return data;
    
    const busquedaLower = busqueda.toLowerCase();
    return data.filter(item => {
      return Object.values(item).some(val => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'object') {
          if (val.toDate) return false; // Saltar Timestamps
          return JSON.stringify(val).toLowerCase().includes(busquedaLower);
        }
        return String(val).toLowerCase().includes(busquedaLower);
      });
    });
  }, [datosActivos, busqueda]);

  // --- ESTADÍSTICAS DE LA TABLA ACTUAL ---
  const estadisticas = useMemo(() => {
    const data = datosActivos;
    if (!Array.isArray(data)) return { total: 0, completados: 0, pendientes: 0 };
    
    const total = data.length;
    
    if (activeTab === 'tareas') {
      const completadas = data.filter(item => item.estado === 'completada').length;
      const pendientes = data.filter(item => item.estado === 'pendiente').length;
      return { total, completados: completadas, pendientes };
    }
    
    if (activeTab === 'notificaciones') {
      const leidas = data.filter(item => item.leida === true).length;
      const noLeidas = data.filter(item => item.leida === false).length;
      return { total, completados: leidas, pendientes: noLeidas };
    }
    
    if (activeTab === 'clientes') {
      const checkIns = data.filter(item => item.checkIn === true).length;
      return { total, completados: checkIns, pendientes: total - checkIns };
    }
    
    return { total, completados: 0, pendientes: total };
  }, [datosActivos, activeTab]);

  // --- EXPORTAR A CSV ---
  const exportarCSV = useCallback(() => {
    const data = datosActivos;
    if (!Array.isArray(data) || data.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const columnas = obtenerColumnas(data);
    const cabeceras = columnas.join(',');
    
    const filas = data.map(item => {
      return columnas.map(col => {
        const valor = item[col];
        if (valor === null || valor === undefined) return '';
        if (typeof valor === 'object') {
          if (valor.toDate) return valor.toDate().toISOString();
          return JSON.stringify(valor).replace(/,/g, ';');
        }
        return String(valor).replace(/,/g, ' ');
      }).join(',');
    }).join('\n');

    const csv = `\uFEFF${cabeceras}\n${filas}`; // BOM para UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeTab}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert(`Exportados ${data.length} registros a CSV`);
  }, [datosActivos, activeTab, obtenerColumnas]);

  // --- EXPORTAR TODO COMO JSON (BACKUP) ---
  const exportarBackupCompleto = useCallback(async () => {
    if (!esAdmin) {
      alert('Solo administradores pueden hacer backup');
      return;
    }
    
    if (!confirm('¿Exportar TODOS los datos como archivo JSON?')) return;
    
    const backup = {};
    for (const col of coleccionesPermitidas) {
      try {
        const data = await leerTodos(col.collection);
        backup[col.id] = data || [];
      } catch (error) {
        console.error(`Error exportando ${col.id}:`, error);
        backup[col.id] = [];
      }
    }
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `firebase_backup_${new Date().toISOString().slice(0,10)}.json`);
    link.click();
    URL.revokeObjectURL(url);
    
    alert('Backup completado');
  }, [esAdmin, coleccionesPermitidas, leerTodos]);

  // --- LIMPIAR COLECCIÓN (SOLO ADMIN) ---
  const limpiarColeccion = useCallback(async () => {
    if (!esAdmin) {
      alert('Solo los administradores pueden limpiar colecciones');
      return;
    }
    
    const coleccionActual = coleccionesPermitidas.find(c => c.id === activeTab);
    if (!coleccionActual) return;
    
    if (!confirm(`⚠️ ¿Estás seguro de eliminar TODOS los datos de "${coleccionActual.nombre}"?\n\nEsta acción NO se puede deshacer.`)) return;
    
    setSincronizando(true);
    
    try {
      const data = await leerTodos(coleccionActual.collection);
      let eliminados = 0;
      
      for (const item of data) {
        if (item.id) {
          await eliminar(coleccionActual.collection, item.id);
          eliminados++;
        }
      }
      
      alert(`✅ Se eliminaron ${eliminados} registros de "${coleccionActual.nombre}"`);
      
      // Actualizar vista local
      setDatos(prev => ({ ...prev, [activeTab]: [] }));
      
    } catch (error) {
      console.error('Error limpiando colección:', error);
      alert('Error al limpiar la colección');
    } finally {
      setSincronizando(false);
    }
  }, [esAdmin, activeTab, coleccionesPermitidas, leerTodos, eliminar]);

  // Columnas para la tabla actual
  const columnas = useMemo(() => obtenerColumnas(datosFiltrados), [datosFiltrados, obtenerColumnas]);

  // Protección de ruta
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Cargando base de datos...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-mono">
      <div className="max-w-7xl mx-auto">
        
        {/* Indicador de sincronización */}
        {sincronizando && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {sincronizando ? 'Cargando...' : 'Sincronizando...'}
          </div>
        )}
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-3">
          <div>
            <nav className="mb-2">
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Volver al Dashboard
              </Link>
            </nav>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">Visor de Base de Datos</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] sm:text-xs text-gray-400">
                {usuario?.nombre} · 
                <span className={`ml-1 px-2 py-0.5 ${
                  esAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {esAdmin ? 'ADMIN' : 'EMPLEADO'}
                </span>
              </p>
              <span className="text-[10px] text-green-600">Firebase Cloud</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setVistaJSON(!vistaJSON)}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                vistaJSON ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              {vistaJSON ? 'Vista Tabla' : 'Vista JSON'}
            </button>
            <button
              onClick={exportarCSV}
              className="px-3 py-1.5 text-xs border border-gray-200 hover:border-gray-400 transition-colors"
              disabled={!Array.isArray(datosActivos) || datosActivos.length === 0}
            >
              Exportar CSV
            </button>
            {esAdmin && (
              <button
                onClick={limpiarColeccion}
                className="px-3 py-1.5 text-xs border border-red-200 text-red-600 hover:border-red-400 transition-colors"
              >
                Limpiar Colección
              </button>
            )}
          </div>
        </header>

        {/* SELECTOR DE COLECCIONES */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-wrap gap-1 sm:gap-2 border-b border-gray-200">
            {coleccionesPermitidas.map(col => (
              <button
                key={col.id}
                onClick={() => setActiveTab(col.id)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors relative ${
                  activeTab === col.id 
                    ? 'text-gray-900 font-medium border-b-2 border-gray-900 -mb-px' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {col.nombre}
                {col.tipo === 'admin' && esAdmin && (
                  <span className="ml-1 text-[8px] bg-purple-100 text-purple-700 px-1 rounded">ADMIN</span>
                )}
                <span className="ml-1 text-[8px] sm:text-[10px] text-gray-400">
                  ({Array.isArray(datosActivos) ? datosActivos.length : '0'})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ESTADÍSTICAS RÁPIDAS */}
        {Array.isArray(datosActivos) && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="border border-gray-200 p-2 sm:p-3 bg-gray-50">
              <p className="text-[8px] sm:text-[10px] text-gray-500">Total registros</p>
              <p className="text-sm sm:text-base font-light">{estadisticas.total}</p>
            </div>
            <div className="border border-gray-200 p-2 sm:p-3 bg-green-50">
              <p className="text-[8px] sm:text-[10px] text-gray-500">
                {activeTab === 'tareas' ? 'Completadas' : 
                 activeTab === 'notificaciones' ? 'Leídas' : 
                 activeTab === 'clientes' ? 'Check-in' : 'Completados'}
              </p>
              <p className="text-sm sm:text-base font-light text-green-600">{estadisticas.completados}</p>
            </div>
            <div className="border border-gray-200 p-2 sm:p-3 bg-amber-50">
              <p className="text-[8px] sm:text-[10px] text-gray-500">
                {activeTab === 'tareas' ? 'Pendientes' : 
                 activeTab === 'notificaciones' ? 'No leídas' : 
                 activeTab === 'clientes' ? 'Sin check-in' : 'Pendientes'}
              </p>
              <p className="text-sm sm:text-base font-light text-amber-600">{estadisticas.pendientes}</p>
            </div>
          </div>
        )}

        {/* BUSCADOR */}
        <div className="mb-3 sm:mb-4">
          <input
            type="text"
            placeholder="Buscar en todos los campos..."
            className="w-full border border-gray-200 px-3 py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="border border-gray-200 bg-white overflow-hidden">
          
          {/* VISTA JSON */}
          {vistaJSON ? (
            <div className="p-3 sm:p-4 overflow-auto max-h-[600px]">
              <pre className="text-[10px] sm:text-xs text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(datosActivos, null, 2)}
              </pre>
            </div>
          ) : (
            /* VISTA TABLA */
            <>
              {!Array.isArray(datosActivos) ? (
                <div className="p-6 sm:p-8 text-center">
                  <p className="text-xs sm:text-sm text-gray-400 mb-2">Datos no tabulares</p>
                  <div className="bg-gray-50 p-3 sm:p-4 border border-gray-200 text-left overflow-auto max-h-[400px]">
                    <pre className="text-[10px] sm:text-xs">
                      {JSON.stringify(datosActivos, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : datosActivos.length === 0 ? (
                <div className="p-8 sm:p-12 text-center text-xs sm:text-sm text-gray-400">
                  No hay registros en esta colección
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[10px] sm:text-xs min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {columnas.map(col => (
                          <th key={col} className="p-2 sm:p-3 text-left font-medium text-gray-600 uppercase tracking-wider">
                            {col}
                          </th>
                        ))}
                        <th className="p-2 sm:p-3 text-center font-medium text-gray-600">ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosFiltrados?.map((item, idx) => (
                        <tr 
                          key={idx} 
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => setExpandido(expandido === idx ? null : idx)}
                        >
                          {columnas.map(col => (
                            <td key={col} className="p-2 sm:p-3 align-top">
                              <div className="flex items-center gap-1">
                                {typeof item[col] === 'object' && item[col] !== null && !item[col].toDate ? (
                                  <button 
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandido(expandido === `${idx}-${col}` ? null : `${idx}-${col}`);
                                    }}
                                  >
                                    {expandido === `${idx}-${col}` ? '▼' : '▶'}
                                  </button>
                                ) : null}
                                <span className={`
                                  ${typeof item[col] === 'boolean' ? 'font-mono' : ''}
                                  ${item[col] === true ? 'text-green-600' : ''}
                                  ${item[col] === false ? 'text-red-600' : ''}
                                  ${col === 'prioridad' && item[col] === 'alta' ? 'text-red-600 font-bold' : ''}
                                  ${col === 'prioridad' && item[col] === 'media' ? 'text-amber-600' : ''}
                                  ${col === 'prioridad' && item[col] === 'baja' ? 'text-green-600' : ''}
                                  ${col === 'estado' && item[col] === 'pendiente' ? 'text-amber-600' : ''}
                                  ${col === 'estado' && item[col] === 'completada' ? 'text-green-600' : ''}
                                `}>
                                  {formatearValor(item[col])}
                                </span>
                              </div>
                              
                              {/* Expandir objetos anidados */}
                              {expandido === `${idx}-${col}` && typeof item[col] === 'object' && item[col] !== null && !item[col].toDate && (
                                <div className="mt-2 p-2 bg-gray-50 border border-gray-200 text-[8px] sm:text-[9px] overflow-auto max-w-xs">
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(item[col], null, 2)}
                                  </pre>
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="p-2 sm:p-3 text-center">
                            <span className="text-[8px] font-mono text-gray-400 break-all">
                              {item.id?.substring(0, 8)}...
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* INFORMACIÓN ADICIONAL */}
        <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-[8px] sm:text-[10px] text-gray-400">
          <div className="border border-gray-200 p-2">
            <p className="font-medium mb-1">Firebase Collection:</p>
            <code className="bg-gray-50 px-1 py-0.5 break-all">
              {coleccionesPermitidas.find(c => c.id === activeTab)?.collection || 'N/A'}
            </code>
          </div>
          <div className="border border-gray-200 p-2">
            <p className="font-medium mb-1">Tamaño aproximado:</p>
            <code className="bg-gray-50 px-1 py-0.5">
              {new Blob([JSON.stringify(datosActivos)]).size.toLocaleString()} bytes
            </code>
          </div>
        </div>

        {/* PIE DE PÁGINA CON ACCIONES GLOBALES (solo admins) */}
        {esAdmin && (
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
            <button
              onClick={exportarBackupCompleto}
              className="text-[10px] sm:text-xs text-gray-500 border border-gray-200 px-3 py-1 hover:border-gray-400 transition-colors"
            >
              Backup Completo (JSON)
            </button>
          </div>
        )}

        {/* Información de conexión */}
        <div className="mt-4 text-center text-[8px] text-gray-400">
          <span>✅ Conectado a Firebase Firestore</span>
          <span className="mx-2">•</span>
          <span>Datos en tiempo real</span>
          <span className="mx-2">•</span>
          <span>{coleccionesPermitidas.length} colecciones disponibles</span>
        </div>
      </div>
    </main>
  );
}
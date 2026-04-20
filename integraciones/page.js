// app/integraciones/page.js (VERSIÓN CON BOTÓN DE CERRAR SESIÓN)
"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

export default function ConexionesClientesPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos,
    cerrarSesion,
    COLLECTIONS 
  } = useFirebase();

  const [asistentes, setAsistentes] = useState([]);
  const [status, setStatus] = useState({ stripe: 'Disconnected', paypal: 'Ready' });
  const [logs, setLogs] = useState(["[SYSTEM]: Terminal de pagos y exportación lista..."]);
  const [cargado, setCargado] = useState(false);
  const [exportando, setExportando] = useState(false);
  
  const isMounted = useRef(true);
  const esAdmin = usuario?.rol === 'admin';

  // --- FUNCIÓN PARA CERRAR SESIÓN ---
  const handleLogout = async () => {
    try {
      await cerrarSesion();
      localStorage.clear();
      sessionStorage.clear();
      router.push('/auth');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  // --- PROTECCIÓN DE RUTA ---
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // --- CARGAR CLIENTES DESDE FIREBASE (CORREGIDO) ---
  useEffect(() => {
    if (!usuario) return;
    
    const cargarClientes = async () => {
      try {
        addLog("Cargando clientes desde Firebase...");
        const clientes = await leerTodos(COLLECTIONS.CLIENTES);
        
        if (isMounted.current) {
          setAsistentes(clientes || []);
          addLog(`✅ Cargados ${clientes?.length || 0} clientes desde Firebase`);
          setCargado(true);
        }
      } catch (error) {
        console.error('Error cargando clientes:', error);
        addLog("❌ ERROR: No se pudieron cargar los clientes");
        if (isMounted.current) {
          setAsistentes([]);
          setCargado(true);
        }
      }
    };
    
    cargarClientes();
    
    return () => {
      isMounted.current = false;
    };
  }, [usuario, leerTodos, COLLECTIONS.CLIENTES]);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 9)]);
  };

  // --- EXPORTAR BASE DE DATOS DE CLIENTES (CORREGIDO) ---
  const exportarCarteraCSV = () => {
    if (exportando) return;
    
    if (asistentes.length === 0) {
      addLog("❌ ERROR: No hay clientes para exportar.");
      return;
    }

    setExportando(true);
    addLog("📊 Estructurando reporte de Clientes SGC...");
    
    // Encabezados más completos
    const encabezados = [
      "ID_CLIENTE", 
      "TICKET", 
      "NOMBRE", 
      "EMAIL", 
      "TELEFONO", 
      "PAQUETE", 
      "MONTO", 
      "ESTADO_SESION", 
      "FECHA_REGISTRO",
      "REGISTRADO_POR"
    ];
    
    const filas = asistentes.map(a => [
      a.id || '', 
      a.ticket || '', 
      `"${(a.nombre || '').replace(/"/g, '""')}"`, 
      a.email || '', 
      a.telefono || '', 
      `"${(a.paquete || a.paqueteNombre || '').replace(/"/g, '""')}"`, 
      a.paquetePrecio || a.monto || 0, 
      a.checkIn ? "REALIZADA" : "PENDIENTE",
      a.fechaHora ? new Date(a.fechaHora).toLocaleDateString() : (a.fecha || new Date().toLocaleDateString()),
      a.registradoPor || 'Sistema'
    ]);

    const contenidoCsv = [encabezados, ...filas].map(e => e.join(",")).join("\n");
    const blob = new Blob([`\uFEFF${contenidoCsv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const fecha = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    addLog(`📁 Generando CARTERA_CLIENTES_${asistentes.length}_${fecha}.csv`);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `SGC_CLIENTES_${fecha}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setTimeout(() => {
      addLog(`✅ ÉXITO: Cartera de ${asistentes.length} clientes exportada correctamente.`);
      setExportando(false);
    }, 1000);
  };

  const conectarPasarela = (plataforma) => {
    addLog(`🔌 Iniciando protocolo de conexión con ${plataforma}...`);
    setTimeout(() => {
      setStatus(prev => ({ ...prev, [plataforma.toLowerCase()]: 'Connected' }));
      addLog(`✅ ${plataforma}: Credenciales validadas. Pagos en línea activos.`);
    }, 1500);
  };

  // Mostrar loading
  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-400">Cargando sistema...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-12 font-light">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER MINIMAL - RESPONSIVE */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-10 gap-3 sm:gap-0">
          <div className="w-full md:w-auto">
            <nav className="mb-2 flex items-center justify-between gap-4 flex-wrap">
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Regresar al Dashboard
              </Link>
              {/* 🔴 NUEVO: Botón de cerrar sesión */}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-900 transition-colors border border-gray-200 px-3 py-1 rounded"
              >
                🚪 Cerrar sesión
              </button>
            </nav>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">Conexiones</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-xs text-gray-400">
                {esAdmin ? 'Administrador' : 'Empleado'} · Datos en tiempo real
              </p>
              {asistentes.length > 0 && (
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  {asistentes.length} clientes
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 md:mt-0 text-right w-full md:w-auto">
            <p className="text-xs text-gray-400 mb-1">Estado global</p>
            <p className="text-sm font-medium text-gray-900">Sistema en línea</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10">
          
          {/* COLUMNA IZQUIERDA - CONFIGURACIÓN */}
          <section className="lg:col-span-7 space-y-4 sm:space-y-6">
            
            {/* MÉTODOS DE PAGO - MINIMAL - RESPONSIVE */}
            <div className="border border-gray-200 p-4 sm:p-6 bg-white">
              <h2 className="text-lg sm:text-xl font-light tracking-tight mb-2">Métodos de pago</h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6">
                Habilita pagos con tarjeta y transferencias para tus sesiones.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <button 
                  onClick={() => conectarPasarela('Stripe')}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border transition-colors ${
                    status.stripe === 'Connected' 
                      ? 'bg-gray-900 text-white border-gray-900' 
                      : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {status.stripe === 'Connected' ? '✓ Stripe conectado' : '🔌 Conectar Stripe'}
                </button>
                <button 
                  onClick={() => conectarPasarela('PayPal')}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border transition-colors ${
                    status.paypal === 'Connected' 
                      ? 'bg-gray-900 text-white border-gray-900' 
                      : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {status.paypal === 'Connected' ? '✓ PayPal conectado' : '🔌 Conectar PayPal'}
                </button>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
                <p>ℹ️ Las conexiones son simuladas. En producción, integra las API reales de Stripe y PayPal.</p>
              </div>
            </div>

            {/* EXPORTACIÓN DE DATA - MINIMAL - RESPONSIVE */}
            <div className="border border-gray-200 p-4 sm:p-6 bg-white">
              <h2 className="text-lg sm:text-xl font-light tracking-tight mb-2">Exportar cartera</h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6">
                Descarga la lista de {asistentes.length} clientes, sus paquetes y estados en formato CSV.
              </p>
              <button 
                onClick={exportarCarteraCSV}
                disabled={exportando || asistentes.length === 0}
                className={`w-full py-3 sm:py-4 text-xs sm:text-sm transition-colors ${
                  exportando || asistentes.length === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                }`}
              >
                {exportando ? '⏳ Exportando...' : '📥 Generar reporte CSV'}
              </button>
              {asistentes.length === 0 && (
                <p className="text-[10px] text-amber-500 mt-2 text-center">
                  No hay clientes registrados para exportar.
                </p>
              )}
            </div>
          </section>

          {/* MONITOR DE ACTIVIDAD - MINIMAL - RESPONSIVE */}
          <section className="lg:col-span-5">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h2 className="text-sm font-medium">Monitor de actividad</h2>
              <button 
                onClick={() => setLogs(["[SYSTEM]: Logs reiniciados..."])}
                className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Limpiar logs
              </button>
            </div>
            <div className="bg-gray-50 p-3 sm:p-5 font-mono text-[10px] sm:text-xs h-[350px] sm:h-[400px] flex flex-col-reverse overflow-y-auto border border-gray-200">
              {logs.length === 0 ? (
                <div className="text-center text-gray-400 py-4">Sin actividad reciente</div>
              ) : (
                logs.map((log, i) => (
                  <div 
                    key={i} 
                    className={`mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200 last:border-0 ${
                      i === 0 ? 'text-gray-900 font-medium' : 'text-gray-500'
                    } ${log.includes('❌') ? 'text-red-600' : ''} ${log.includes('✅') ? 'text-green-600' : ''}`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
            <p className="mt-2 sm:mt-3 text-[8px] sm:text-[9px] text-gray-400">
              Los logs muestran la actividad reciente del sistema.
            </p>
          </section>
        </div>

        {/* INFORMACIÓN ADICIONAL */}
        <div className="mt-6 sm:mt-8 pt-4 border-t border-gray-200 text-center text-[8px] text-gray-400">
          <p>🔒 Datos seguros en Firebase Firestore</p>
          <p className="mt-1">📊 Última actualización: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </main>
  );
}
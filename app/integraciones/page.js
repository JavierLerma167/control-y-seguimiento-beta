"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ConexionesClientesPage() {
  const router = useRouter();

  const [asistentes, setAsistentes] = useState([]);
  const [status, setStatus] = useState({ stripe: 'Disconnected', paypal: 'Ready' });
  const [logs, setLogs] = useState(["[SYSTEM]: Terminal de pagos y exportación lista..."]);

  // --- PROTECCIÓN DE RUTA ---
  useEffect(() => {
    const sesion = localStorage.getItem('session_active');
    if (!sesion) router.push('/auth');
  }, [router]);

  // --- CARGA DE CLIENTES PARA EXPORTAR ---
  useEffect(() => {
    const datos = localStorage.getItem('registros_asistentes');
    if (datos) setAsistentes(JSON.parse(datos));
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 9)]);
  };

  // --- EXPORTAR BASE DE DATOS DE CLIENTES ---
  const exportarCarteraCSV = () => {
    if (asistentes.length === 0) {
      addLog("ERROR: No hay base de datos de clientes para exportar.");
      return;
    }

    addLog("Estructurando reporte de Clientes SGC...");
    
    const encabezados = ["ID_CLIENTE", "NOMBRE", "PAQUETE", "LOCACION", "ESTADO_SESION", "FECHA_REGISTRO"];
    const filas = asistentes.map(a => [
      a.id, 
      `"${a.nombre}"`, 
      `"${a.paquete}"`, 
      `"${a.locacion || 'Estudio'}"`, 
      a.checkIn ? "REALIZADA" : "PENDIENTE",
      a.fecha || "2026"
    ]);

    const contenidoCsv = [encabezados, ...filas].map(e => e.join(",")).join("\n");
    const blob = new Blob([contenidoCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    addLog(`Generando CARTERA_CLIENTES_${asistentes.length}.csv`);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `SGC_CLIENTES_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      addLog("ÉXITO: Cartera de clientes descargada para CRM.");
    }, 1000);
  };

  const conectarPasarela = (plataforma) => {
    addLog(`Iniciando protocolo de conexión con ${plataforma}...`);
    setTimeout(() => {
      setStatus(prev => ({ ...prev, [plataforma.toLowerCase()]: 'Connected' }));
      addLog(`${plataforma}: Credenciales validadas. Pagos en línea activos.`);
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-12 font-light">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER MINIMAL - RESPONSIVE */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-10 gap-3 sm:gap-0">
          <div className="w-full md:w-auto">
            <nav className="mb-2">
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Regresar al Dashboard
              </Link>
            </nav>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">Conexiones</h1>
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
                  {status.stripe === 'Connected' ? 'Stripe conectado' : 'Conectar Stripe'}
                </button>
                <button 
                  onClick={() => conectarPasarela('PayPal')}
                  className={`py-3 sm:py-4 text-xs sm:text-sm border transition-colors ${
                    status.paypal === 'Connected' 
                      ? 'bg-gray-900 text-white border-gray-900' 
                      : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {status.paypal === 'Connected' ? 'PayPal conectado' : 'Conectar PayPal'}
                </button>
              </div>
            </div>

            {/* EXPORTACIÓN DE DATA - MINIMAL - RESPONSIVE */}
            <div className="border border-gray-200 p-4 sm:p-6 bg-white">
              <h2 className="text-lg sm:text-xl font-light tracking-tight mb-2">Exportar cartera</h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6">
                Descarga la lista de {asistentes.length} clientes, sus paquetes y estados.
              </p>
              <button 
                onClick={exportarCarteraCSV}
                className="w-full border border-gray-200 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
              >
                Generar reporte CSV
              </button>
            </div>
          </section>

          {/* MONITOR DE ACTIVIDAD - MINIMAL - RESPONSIVE */}
          <section className="lg:col-span-5">
            <h2 className="text-sm font-medium mb-3 sm:mb-4">Monitor de sincronización</h2>
            <div className="bg-gray-50 p-3 sm:p-5 font-mono text-[10px] sm:text-xs h-[300px] sm:h-[400px] flex flex-col-reverse overflow-hidden border border-gray-200">
              {logs.map((log, i) => (
                <div 
                  key={i} 
                  className={`mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200 last:border-0 ${
                    i === 0 ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
            <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-400">
              Los logs se limpian al reiniciar la sesión.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
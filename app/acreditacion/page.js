// app/acreditacion/page.js
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

export default function AcreditacionClientesPage() {
  const router = useRouter();
  const { usuario, cargando: authCargando, leerTodos, crear, actualizar, eliminar, suscribir, COLLECTIONS } = useFirebase();

  const [asistentes, setAsistentes] = useState([]);
  const [form, setForm] = useState({ nombre: '', paquete: 'Básico', email: '', telefono: '', direccion: '', nota: '$1,500' });
  const [busqueda, setBusqueda] = useState('');
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [vistaTicket, setVistaTicket] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, nombre: '' });

  const preciosPaquetes = {
    'Básico': '$1,500',
    'Premium': '$3,500',
    'Boda / Evento': '$12,000',
    'Sesión XV': '$5,000',
    'Corporativo': '$8,000'
  };

  const esAdmin = usuario?.rol === 'admin';
  const isMounted = useRef(true);

  // Actualizar nota según paquete seleccionado
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      nota: preciosPaquetes[prev.paquete] || '$0'
    }));
  }, [form.paquete]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A CLIENTES (ACREDITACIONES) ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.CLIENTES, (data) => {
      if (isMounted.current) {
        const clientesOrdenados = (data || []).sort((a, b) => 
          new Date(b.fechaHora || b.fecha) - new Date(a.fechaHora || a.fecha)
        );
        setAsistentes(clientesOrdenados);
        setCargado(true);
        setSincronizando(false);
      }
    });
    
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [usuario, suscribir]);

  // --- FUNCIÓN PARA VERIFICAR EXISTENCIA EN FIRESTORE ---
  const verificarExistenciaCliente = useCallback(async (nombre, ticket) => {
    try {
      // Buscar por ticket (más confiable que por nombre)
      const existentes = await leerTodos(COLLECTIONS.CLIENTES, {
        campo: 'ticket',
        operador: '==',
        valor: ticket
      });
      return existentes && existentes.length > 0;
    } catch (error) {
      console.error('Error verificando existencia:', error);
      return false;
    }
  }, [leerTodos]);

  // --- ESCUCHAR NUEVOS REGISTROS DESDE CATÁLOGO (cola) ---
  useEffect(() => {
    if (!usuario) return;
    
    const procesarNuevoRegistro = async (nuevoRegistro) => {
      try {
        // Verificar si ya existe usando Firestore directamente
        const existe = await verificarExistenciaCliente(
          nuevoRegistro.nombre, 
          nuevoRegistro.ticket
        );
        
        if (!existe && isMounted.current) {
          // Mostrar notificación
          setNotificacion({ visible: true, nombre: nuevoRegistro.nombre });
          setTimeout(() => setNotificacion({ visible: false, nombre: '' }), 5000);
          
          // Formatear y guardar en clientes
          const infoPaquete = typeof nuevoRegistro.paquete === 'object' ? nuevoRegistro.paquete : {
            id: null,
            nombre: nuevoRegistro.paquete || 'SERVICIO SELECCIONADO',
            precio: nuevoRegistro.monto || 0,
            categoria: nuevoRegistro.categoria || 'GENERAL',
            incluye: ['Información no disponible']
          };
          
          const nuevoCliente = {
            ticket: nuevoRegistro.ticket || `TK-${Date.now()}`,
            nombre: nuevoRegistro.nombre,
            email: nuevoRegistro.email || 'SIN EMAIL',
            telefono: nuevoRegistro.telefono || 'SIN TELÉFONO',
            direccion: nuevoRegistro.direccion || 'SIN DIRECCION',
            paqueteInfo: infoPaquete,
            paqueteNombre: infoPaquete.nombre,
            paquetePrecio: infoPaquete.precio,
            paqueteIncluye: infoPaquete.incluye || [],
            paqueteCategoria: infoPaquete.categoria || nuevoRegistro.categoria || 'GENERAL',
            paqueteId: infoPaquete.id,
            paquete: infoPaquete.nombre,
            nota: `Monto: $${nuevoRegistro.monto || infoPaquete.precio || '0'}`,
            fecha: new Date().toLocaleDateString(),
            fechaRegistro: nuevoRegistro.fechaRegistro || new Date().toISOString(),
            fechaHora: nuevoRegistro.fechaHora || new Date().toISOString(),
            metodoPago: nuevoRegistro.metodoPago || 'Por definir',
            checkIn: false,
            registradoPor: nuevoRegistro.registradoPor || 'Sistema',
            registradoPorId: nuevoRegistro.registradoPorId || null
          };
          
          await crear(COLLECTIONS.CLIENTES, nuevoCliente);
          
          // Eliminar de la cola
          if (nuevoRegistro.id) {
            await eliminar('COLA_ACREDITACION', nuevoRegistro.id);
          }
        }
      } catch (error) {
        console.error('Error procesando registro de cola:', error);
      }
    };
    
    const unsubscribeCola = suscribir('COLA_ACREDITACION', (data) => {
      if (data && data.length > 0 && isMounted.current) {
        data.forEach(procesarNuevoRegistro);
      }
    });
    
    return () => unsubscribeCola();
  }, [usuario, crear, eliminar, verificarExistenciaCliente]);

  // --- VALIDAR FORMULARIO ---
  const validarFormulario = () => {
    const errores = [];
    
    if (!form.nombre.trim()) {
      errores.push('El nombre es requerido');
    } else if (form.nombre.length < 3) {
      errores.push('El nombre debe tener al menos 3 caracteres');
    }
    
    if (!form.email.trim()) {
      errores.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errores.push('Email inválido');
    }
    
    if (form.telefono && !/^\d{10,15}$/.test(form.telefono.replace(/\D/g, ''))) {
      errores.push('Teléfono inválido (10-15 dígitos)');
    }
    
    if (!form.direccion.trim()) {
      errores.push('La dirección es requerida');
    }
    
    if (errores.length > 0) {
      alert(errores.join('\n'));
      return false;
    }
    
    return true;
  };

  // --- GENERAR ID ÚNICO ---
  const generarIdUnico = () => {
    return `CLI-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  };

  // --- REGISTRAR CLIENTE MANUALMENTE ---
  const registrarCliente = async (e) => {
    e.preventDefault();
    
    if (!validarFormulario()) return;
    
    setGuardando(true);
    
    try {
      const nuevoCliente = { 
        ticket: `TK-MANUAL-${Date.now().toString().slice(-6)}`,
        nombre: form.nombre,
        email: form.email,
        telefono: form.telefono,
        direccion: form.direccion,
        fecha: new Date().toLocaleDateString(),
        fechaHora: new Date().toISOString(),
        checkIn: false,
        nota: `Monto: ${form.nota}`,
        paquete: form.paquete,
        paqueteInfo: {
          nombre: form.paquete,
          precio: form.nota.replace('Monto: $', ''),
          incluye: ['Registro manual']
        },
        registradoPor: usuario?.nombre || 'Sistema',
        registradoPorId: usuario?.id
      };
      
      await crear(COLLECTIONS.CLIENTES, nuevoCliente);
      
      setForm({ nombre: '', paquete: 'Básico', email: '', telefono: '', direccion: '', nota: '$1,500' });
      alert('Cliente registrado correctamente');
    } catch (error) {
      console.error('Error registrando cliente:', error);
      alert('Error al registrar cliente');
    } finally {
      setGuardando(false);
    }
  };

  // --- TOGGLE CHECK-IN ---
  const toggleCheckIn = async (id) => {
    const cliente = asistentes.find(a => a.id === id);
    if (cliente) {
      setGuardando(true);
      try {
        await actualizar(COLLECTIONS.CLIENTES, id, { 
          checkIn: !cliente.checkIn,
          fechaCheckIn: !cliente.checkIn ? new Date().toISOString() : null
        });
      } catch (error) {
        console.error('Error actualizando check-in:', error);
        alert('Error al actualizar estado');
      } finally {
        setGuardando(false);
      }
    }
  };

  // --- ELIMINAR CLIENTE ---
  const eliminarAsistente = async (id) => {
    if (!confirm("¿Eliminar registro de este cliente? Esta acción no se puede deshacer.")) return;
    
    setGuardando(true);
    try {
      await eliminar(COLLECTIONS.CLIENTES, id);
      if (seleccionado?.id === id) {
        setSeleccionado(null);
        setVistaTicket(false);
      }
      alert('Cliente eliminado correctamente');
    } catch (error) {
      console.error('Error eliminando cliente:', error);
      alert('Error al eliminar cliente');
    } finally {
      setGuardando(false);
    }
  };

  // --- FILTRAR CLIENTES MEMOIZADO ---
  const asistentesFiltrados = useMemo(() => {
    return asistentes.filter(a => 
      a.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || 
      a.paquete?.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [asistentes, busqueda]);

  // --- COMPONENTE TICKET ---
  const TicketCompra = ({ data }) => (
    <div className="bg-white border-2 border-gray-900 p-4 sm:p-6 font-mono text-xs sm:text-sm relative max-w-md mx-auto">
      <div className="absolute -top-2 left-0 right-0 flex justify-center">
        <div className="bg-white px-2 text-[8px] text-gray-400">······ CORTE AQUÍ ······</div>
      </div>
      
      <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 sm:pb-4 mb-3 sm:mb-4">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">EVR PRO STUDIO</h2>
        <p className="text-[9px] sm:text-[10px] text-gray-500">TICKET DE COMPRA</p>
        <p className="text-[7px] sm:text-[8px] text-gray-400 mt-1">
          {data.fechaHora ? new Date(data.fechaHora).toLocaleString() : data.fecha}
        </p>
      </div>

      <div className="bg-gray-100 p-1.5 sm:p-2 text-center mb-3 sm:mb-4">
        <span className="text-[9px] sm:text-[10px] text-gray-500">TICKET #</span>
        <p className="text-xs sm:text-sm font-bold break-all">{data.ticket || 'N/A'}</p>
      </div>

      <div className="space-y-0.5 sm:space-y-1 mb-3 sm:mb-4 text-[10px] sm:text-[11px]">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
          <span className="text-gray-500">CLIENTE:</span>
          <span className="font-medium break-words">{data.nombre}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
          <span className="text-gray-500">EMAIL:</span>
          <span className="break-words">{data.email}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
          <span className="text-gray-500">TEL:</span>
          <span>{data.telefono}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
          <span className="text-gray-500">DIRECCIÓN:</span>
          <span className="text-right text-[9px] sm:text-[9px] break-words">{data.direccion}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-300 pt-3 sm:pt-4 mb-3 sm:mb-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-0 mb-2">
          <span className="text-xs sm:text-xs font-bold break-words">{data.paquete}</span>
          <span className="text-xs sm:text-sm font-bold">{data.nota}</span>
        </div>
        
        {data.paqueteInfo?.incluye && data.paqueteInfo.incluye.length > 0 && (
          <div className="text-[8px] sm:text-[9px] text-gray-500 space-y-0.5 pl-2">
            {data.paqueteInfo.incluye.map((item, idx) => (
              <div key={idx} className="flex items-start gap-1">
                <span>•</span>
                <span className="break-words">{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center my-3 sm:my-4">
        <div className="border border-gray-200 p-2 sm:p-3 bg-white">
          <QRCode 
            size={typeof window !== 'undefined' && window.innerWidth < 640 ? 120 : 140} 
            value={JSON.stringify({ 
              ticket: data.ticket,
              cliente: data.nombre,
              paquete: data.paquete,
              fecha: data.fecha
            })} 
          />
        </div>
      </div>

      <div className="border-t-2 border-dashed border-gray-300 pt-3 sm:pt-4 mt-2">
        <div className="flex flex-col sm:flex-row sm:justify-between text-base sm:text-base font-bold mb-2 gap-1 sm:gap-0">
          <span>TOTAL</span>
          <span>{data.nota}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between text-[8px] sm:text-[9px] text-gray-400 gap-1 sm:gap-0">
          <span>MÉTODO DE PAGO</span>
          <span>{data.metodoPago || 'POR DEFINIR'}</span>
        </div>
      </div>

      <div className="text-center mt-4 sm:mt-6 text-[7px] sm:text-[8px] text-gray-400 border-t border-dashed border-gray-200 pt-3 sm:pt-4">
        <p>Ticket válido para acreditación</p>
        <p>Presentar en área de sesiones</p>
        <p className="mt-1 sm:mt-2">¡Gracias por tu compra!</p>
      </div>
    </div>
  );

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
          <p className="text-sm text-gray-400">Cargando sistema...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-12 font-light">
      
      {/* Indicadores de estado */}
      {(sincronizando || guardando) && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
          {guardando ? 'Guardando...' : 'Sincronizando...'}
        </div>
      )}
      
      {/* NOTIFICACIÓN FLOTANTE */}
      {notificacion.visible && (
        <div className="fixed top-4 sm:top-6 right-4 sm:right-6 left-4 sm:left-auto z-50 animate-in slide-in-from-right-5 fade-in duration-300">
          <div className="bg-gray-900 text-white p-4 sm:p-5 w-full sm:min-w-[280px] shadow-lg">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-400">Nuevo registro</span>
              <button 
                onClick={() => setNotificacion({visible: false, nombre:''})} 
                className="text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-sm">✕</span>
              </button>
            </div>
            <p className="text-lg sm:text-xl font-light mb-1 break-words">{notificacion.nombre}</p>
            <p className="text-[10px] sm:text-xs text-gray-400">Ha adquirido un paquete desde el catálogo</p>
            <div className="h-px bg-gray-800 w-full mt-3 sm:mt-4">
              <div className="h-px bg-white animate-shrink-width" style={{animation: 'shrink 5s linear forwards'}}></div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-10 gap-3 sm:gap-0">
          <div className="w-full md:w-auto">
            <nav className="mb-2 sm:mb-3">
              <Link href="/" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                ← Panel de control
              </Link>
            </nav>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight">Acreditaciones</h1>
            <p className="text-xs text-gray-400 mt-1">
              {esAdmin ? 'Administrador' : 'Empleado'} · Tiempo real
            </p>
          </div>
          <div className="mt-2 md:mt-0">
            <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">Registros totales</p>
            <p className="text-2xl sm:text-3xl font-light">{asistentes.length}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10">
          {/* Columna izquierda - Formulario */}
          <section className="lg:col-span-4 space-y-6 sm:space-y-8">
            <div className="bg-gray-50 p-4 sm:p-6 border border-gray-200">
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4 sm:mb-6">Registro manual</h2>
              <form onSubmit={registrarCliente} className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
                  <input 
                    type="text" required
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.nombre}
                    onChange={(e) => setForm({...form, nombre: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Paquete</label>
                  <select 
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.paquete}
                    onChange={(e) => setForm({...form, paquete: e.target.value})}
                  >
                    {Object.keys(preciosPaquetes).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input 
                    type="email" required
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
                  <input 
                    type="tel"
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.telefono}
                    onChange={(e) => setForm({...form, telefono: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dirección *</label>
                  <input 
                    type="text" required
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.direccion}
                    onChange={(e) => setForm({...form, direccion: e.target.value})}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-gray-200 pt-3 sm:pt-4 mt-3 sm:mt-4">
                  <span className="text-xs text-gray-500">Monto</span>
                  <input 
                    type="text" 
                    className="text-right outline-none font-medium text-gray-900 text-sm w-20 sm:w-24 bg-transparent"
                    value={form.nota}
                    onChange={(e) => setForm({...form, nota: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={guardando}
                  className="w-full bg-gray-900 text-white text-sm py-3 hover:bg-gray-800 transition-colors mt-3 sm:mt-4 disabled:opacity-50"
                >
                  {guardando ? 'Registrando...' : 'Generar acreditación'}
                </button>
              </form>
            </div>

            {/* Vista de ticket */}
            {vistaTicket && seleccionado && (
              <div className="animate-in fade-in duration-300">
                <TicketCompra data={seleccionado} />
                <div className="mt-4 flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                  <button 
                    onClick={() => window.print()} 
                    className="w-full sm:w-auto bg-gray-900 text-white px-4 py-2 text-xs hover:bg-gray-800 transition-colors"
                  >
                    Imprimir ticket
                  </button>
                  <button 
                    onClick={() => {
                      setVistaTicket(false);
                      setSeleccionado(null);
                    }} 
                    className="w-full sm:w-auto px-4 py-2 text-xs border border-gray-200 hover:border-gray-400 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Columna derecha - Lista de clientes */}
          <section className="lg:col-span-8">
            <div className="mb-4 sm:mb-6">
              <input 
                type="text" 
                placeholder="Buscar por nombre o paquete..." 
                className="w-full border border-gray-200 px-3 sm:px-4 py-2 sm:py-3 text-sm focus:border-gray-400 outline-none transition-colors"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="space-y-2 sm:space-y-3">
              {asistentesFiltrados.length === 0 ? (
                <div className="py-12 sm:py-16 text-center border border-gray-100 text-sm text-gray-400">
                  Sin registros
                </div>
              ) : (
                asistentesFiltrados.map((a) => (
                  <div 
                    key={a.id} 
                    className={`flex flex-col sm:flex-row sm:flex-wrap items-start justify-between p-4 sm:p-5 border transition-colors ${
                      a.checkIn ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex-1 min-w-[250px] w-full sm:w-auto mb-3 sm:mb-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[8px] sm:text-[9px] bg-gray-200 px-1.5 py-0.5 font-mono">
                          #{a.ticket}
                        </span>
                        <h4 className={`text-sm sm:text-base font-medium ${a.checkIn ? 'text-gray-400' : 'text-gray-900'}`}>
                          {a.nombre}
                        </h4>
                      </div>
                      
                      <div className="text-xs text-gray-500 mb-2 pl-2 border-l border-gray-100 break-words">
                        <div>{a.email}</div>
                        <div>{a.telefono}</div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="font-medium break-words">{a.paquete}</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-700">{a.nota}</span>
                      </div>
                      
                      <div className="text-[9px] sm:text-[10px] text-gray-400 mt-1">
                        {a.fecha}
                      </div>
                    </div>
                    
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-2 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSeleccionado(a);
                            setVistaTicket(true);
                          }} 
                          className="text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 whitespace-nowrap"
                        >
                          Ver ticket
                        </button>
                        <button 
                          onClick={() => toggleCheckIn(a.id)}
                          disabled={guardando}
                          className={`px-3 py-1 text-xs border transition-colors whitespace-nowrap ${
                            a.checkIn 
                              ? 'bg-gray-900 text-white border-gray-900' 
                              : 'border-gray-200 hover:border-gray-400'
                          } disabled:opacity-50`}
                        >
                          {a.checkIn ? 'Acreditado' : 'Pendiente'}
                        </button>
                      </div>
                      {esAdmin && (
                        <button 
                          onClick={() => eliminarAsistente(a.id)} 
                          disabled={guardando}
                          className="text-gray-300 hover:text-gray-600 text-xs whitespace-nowrap disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        @media print {
          body * { visibility: hidden; }
          .border-2.border-gray-900, .border-2.border-gray-900 * { 
            visibility: visible; 
          }
          .border-2.border-gray-900 { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%;
            max-width: 400px;
          }
        }
      `}</style>
    </main>
  );
}
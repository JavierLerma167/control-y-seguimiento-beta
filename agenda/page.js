// app/agenda/page.js (VERSIÓN CON BOTÓN DE CERRAR SESIÓN)
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

export default function AgendaFotosPage() {
  const router = useRouter();
  const { usuario, cargando: authCargando, leerTodos, crear, actualizar, eliminar, suscribir, cerrarSesion, COLLECTIONS } = useFirebase();
  
  const [eventos, setEventos] = useState([]);
  const [instituciones, setInstituciones] = useState([]);
  const [gruposPendientes, setGruposPendientes] = useState([]);
  const [form, setForm] = useState({ 
    grupoId: '',
    grupoNombre: '',
    cliente: '',
    institucionId: '',
    institucionNombre: '',
    fecha: '',
    hora: '',
    pedidoId: ''
  });
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('todas');
  const [vistaCalendario, setVistaCalendario] = useState(false);
  const [modalAgendar, setModalAgendar] = useState(false);
  const [modalEditarHora, setModalEditarHora] = useState(false);
  const [citaEditando, setCitaEditando] = useState(null);
  const [nuevaHora, setNuevaHora] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const esAdmin = usuario?.rol === 'admin';
  const isMounted = useRef(true);
  const intervalRef = useRef(null);
  const initialDataLoadedRef = useRef(false);

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

  // --- FUNCIÓN PARA NORMALIZAR FECHAS (MEJORADA) ---
  const normalizarFecha = useCallback((fechaStr) => {
    if (!fechaStr) return null;
    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return null;
      return fecha.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }, []);

  // --- FUNCIÓN PARA CARGAR GRUPOS PENDIENTES ---
  const cargarGruposPendientes = useCallback(async () => {
    if (!usuario || !isMounted.current) return;
    
    try {
      const pedidosData = await leerTodos(COLLECTIONS.PEDIDOS);
      const eventosActuales = await leerTodos(COLLECTIONS.AGENDA);
      
      if (pedidosData && pedidosData.length > 0 && isMounted.current) {
        const data = pedidosData[0];
        if (data && data.instituciones) {
          const instData = data.instituciones.map(inst => ({
            id: inst.id,
            nombre: inst.nombre,
            fecha: inst.fecha || 'Fecha no definida',
            director: inst.director || '',
            grupos: inst.grupos || []
          }));
          
          setInstituciones(instData);
          
          const pendientes = [];
          const eventosIds = new Set(eventosActuales?.map(e => e.grupoId) || []);
          
          instData.forEach(inst => {
            inst.grupos?.forEach(grupo => {
              if (!eventosIds.has(grupo.id) && grupo.registros && grupo.registros.length > 0) {
                const clientes = grupo.registros.map(r => r.cliente).filter(c => c);
                pendientes.push({
                  id: grupo.id,
                  nombre: grupo.nombre,
                  institucionId: inst.id,
                  institucionNombre: inst.nombre,
                  fecha: inst.fecha,
                  clientes: clientes,
                  totalClientes: clientes.length,
                  notas: grupo.notas || ''
                });
              }
            });
          });
          
          setGruposPendientes(pendientes);
          initialDataLoadedRef.current = true;
        }
      }
    } catch (error) {
      console.error('Error cargando grupos pendientes:', error);
    }
  }, [usuario, leerTodos]);

  // --- CARGAR INSTITUCIONES Y GRUPOS PENDIENTES ---
  useEffect(() => {
    if (!usuario) return;
    
    cargarGruposPendientes();
    
    intervalRef.current = setInterval(() => {
      if (isMounted.current) {
        cargarGruposPendientes();
      }
    }, 30000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [usuario, cargarGruposPendientes]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A AGENDA ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.AGENDA, (data) => {
      if (isMounted.current) {
        const eventosOrdenados = (data || []).sort((a, b) => {
          if (a.fecha && b.fecha) {
            const fechaCompare = a.fecha.localeCompare(b.fecha);
            if (fechaCompare !== 0) return fechaCompare;
          }
          if (a.hora && b.hora) {
            return a.hora.localeCompare(b.hora);
          }
          return 0;
        });
        setEventos(eventosOrdenados);
        setCargado(true);
        setSincronizando(false);
      }
    }, (error) => {
      console.error('Error en suscripción de agenda:', error);
      setSincronizando(false);
      if (isMounted.current) {
        alert('Error al cargar la agenda. Recargando...');
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [usuario, suscribir]);

  // --- AGENDAR HORA PARA UN GRUPO ---
  const abrirModalAgendar = (grupo) => {
    setGrupoSeleccionado(grupo);
    setForm({
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      cliente: grupo.clientes.join(', '),
      institucionId: grupo.institucionId,
      institucionNombre: grupo.institucionNombre,
      fecha: grupo.fecha,
      hora: '',
      pedidoId: ''
    });
    setModalAgendar(true);
  };

  const guardarAgendar = async (e) => {
    e.preventDefault();
    if (!form.hora) {
      alert('Seleccione una hora para la sesión');
      return;
    }

    setGuardando(true);
    
    try {
      const fechaNormalizada = normalizarFecha(form.fecha);
      const conflicto = eventos.some(e => {
        const eFechaNormalizada = normalizarFecha(e.fecha);
        return eFechaNormalizada === fechaNormalizada && e.hora === form.hora;
      });
      
      if (conflicto) {
        alert('Ya existe una cita agendada en ese horario. Por favor selecciona otra hora.');
        setGuardando(false);
        return;
      }

      const nuevaCita = { 
        grupoId: form.grupoId,
        grupoNombre: form.grupoNombre,
        clientes: form.cliente,
        institucionId: form.institucionId,
        institucionNombre: form.institucionNombre,
        fecha: form.fecha,
        hora: form.hora,
        finalizada: false,
        fechaCreacion: new Date().toISOString(),
        fechaISO: new Date().toISOString(),
        registradoPor: usuario?.nombre || 'Sistema',
        registradoPorId: usuario?.id
      };
      
      await crear(COLLECTIONS.AGENDA, nuevaCita);
      setModalAgendar(false);
      setGrupoSeleccionado(null);
      resetFormulario();
      
      await cargarGruposPendientes();
    } catch (error) {
      console.error('Error al agendar:', error);
      alert('Error al agendar la cita');
    } finally {
      setGuardando(false);
    }
  };

  // --- ABRIR MODAL PARA EDITAR HORA ---
  const abrirModalEditarHora = (cita) => {
    setCitaEditando(cita);
    setNuevaHora(cita.hora);
    setModalEditarHora(true);
  };

  // --- GUARDAR EDICIÓN DE HORA ---
  const guardarEdicionHora = async () => {
    if (!nuevaHora || !citaEditando) return;
    
    setGuardando(true);
    
    try {
      const fechaNormalizada = normalizarFecha(citaEditando.fecha);
      const conflicto = eventos.some(e => 
        e.id !== citaEditando.id &&
        normalizarFecha(e.fecha) === fechaNormalizada && 
        e.hora === nuevaHora
      );
      
      if (conflicto) {
        alert('Ya existe otra cita en ese horario. Por favor selecciona otra hora.');
        setGuardando(false);
        return;
      }
      
      await actualizar(COLLECTIONS.AGENDA, citaEditando.id, { 
        hora: nuevaHora,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario?.nombre
      });
      
      setModalEditarHora(false);
      setCitaEditando(null);
      setNuevaHora('');
    } catch (error) {
      console.error('Error al editar hora:', error);
      alert('Error al editar la hora');
    } finally {
      setGuardando(false);
    }
  };

  // --- MARCAR COMO COMPLETADA/PENDIENTE ---
  const toggleFinalizada = async (id, finalizadaActual) => {
    setGuardando(true);
    
    try {
      await actualizar(COLLECTIONS.AGENDA, id, { 
        finalizada: !finalizadaActual,
        fechaFinalizacion: !finalizadaActual ? new Date().toISOString() : null,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario?.nombre
      });
      
      if (finalizadaActual) {
        await cargarGruposPendientes();
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('Error al cambiar el estado de la cita');
    } finally {
      setGuardando(false);
    }
  };

  // --- ELIMINAR CITA ---
  const eliminarCita = async (id) => {
    if (!confirm("¿Cancelar esta cita de sesión? Esta acción no se puede deshacer.")) return;
    
    setGuardando(true);
    
    try {
      await eliminar(COLLECTIONS.AGENDA, id);
      await cargarGruposPendientes();
    } catch (error) {
      console.error('Error al eliminar cita:', error);
      alert('Error al eliminar la cita');
    } finally {
      setGuardando(false);
    }
  };

  // --- RESET FORMULARIO ---
  const resetFormulario = () => {
    setForm({ 
      grupoId: '',
      grupoNombre: '',
      cliente: '',
      institucionId: '',
      institucionNombre: '',
      fecha: '',
      hora: '',
      pedidoId: ''
    });
  };

  // --- FILTRADO DE CITAS MEMOIZADO (CORREGIDO) ---
  const eventosFiltrados = useMemo(() => {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    
    return eventos.filter(ev => {
      const coincideBusqueda = 
        ev.grupoNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        ev.institucionNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        ev.clientes?.toLowerCase().includes(busqueda.toLowerCase());
      
      if (!coincideBusqueda) return false;
      
      if (filtroFecha === 'hoy') {
        const fechaEvento = normalizarFecha(ev.fecha);
        return fechaEvento === hoyISO;
      }
      return true;
    });
  }, [eventos, busqueda, filtroFecha, normalizarFecha]);

  // --- ESTADÍSTICAS MEMOIZADAS (CORREGIDO) ---
  const estadisticas = useMemo(() => {
    const hoyISO = new Date().toISOString().split('T')[0];
    
    return {
      total: eventos.length,
      pendientes: eventos.filter(e => !e.finalizada).length,
      completadas: eventos.filter(e => e.finalizada).length,
      hoy: eventos.filter(e => normalizarFecha(e.fecha) === hoyISO).length,
      gruposPendientes: gruposPendientes.length
    };
  }, [eventos, gruposPendientes, normalizarFecha]);

  // Protección de ruta (CORREGIDO - añadido router a dependencias)
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-400">Cargando agenda...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-light">
      <div className="max-w-7xl mx-auto">
        
        {/* Indicadores de estado */}
        {(sincronizando || guardando) && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {guardando ? '💾 Guardando...' : '🔄 Sincronizando...'}
          </div>
        )}
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-3">
          <div>
            <nav className="mb-2 flex items-center justify-between gap-4 flex-wrap">
              <Link href="/" className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Volver al Dashboard
              </Link>
              {/* 🔴 NUEVO: Botón de cerrar sesión */}
              <button
                onClick={handleLogout}
                className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-900 transition-colors border border-gray-200 px-3 py-1 rounded"
              >
                🚪 Cerrar sesión
              </button>
            </nav>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">📅 Agenda de Sesiones</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-[10px] sm:text-xs text-gray-400">
                Asignación de horarios para sesiones fotográficas · {esAdmin ? '👑 Administrador' : '👤 Empleado'}
              </p>
              <span className="text-[10px] sm:text-xs text-green-600">Tiempo real</span>
            </div>
          </div>
          
          <div className="w-full md:w-80">
            <input 
              type="text" 
              placeholder="🔍 Buscar por grupo, institución o cliente..." 
              className="w-full border border-gray-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-1 sm:gap-2 mb-4 sm:mb-6">
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📋 Total citas</p>
            <p className="text-sm sm:text-base font-light">{estadisticas.total}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">⏳ Pendientes</p>
            <p className="text-sm sm:text-base font-light text-amber-600">{estadisticas.pendientes}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">✅ Completadas</p>
            <p className="text-sm sm:text-base font-light text-green-600">{estadisticas.completadas}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📅 Citas hoy</p>
            <p className="text-sm sm:text-base font-light">{estadisticas.hoy}</p>
          </div>
          <div className="border border-gray-900 p-2 sm:p-3 bg-gray-900 text-white">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📦 Grupos pendientes</p>
            <p className="text-sm sm:text-base font-light">{estadisticas.gruposPendientes}</p>
          </div>
        </section>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-1 sm:gap-2 mb-4 sm:mb-6">
          <button
            onClick={() => setFiltroFecha('todas')}
            className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 border ${filtroFecha === 'todas' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
          >
            Todas las fechas
          </button>
          <button
            onClick={() => setFiltroFecha('hoy')}
            className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 border ${filtroFecha === 'hoy' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
          >
            Solo hoy
          </button>
          <button
            onClick={() => setVistaCalendario(!vistaCalendario)}
            className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 border border-gray-200 hover:border-gray-400 ml-auto"
          >
            {vistaCalendario ? '📋 Vista lista' : '📅 Vista calendario'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-6">
          
          {/* COLUMNA IZQUIERDA: GRUPOS PENDIENTES */}
          <section className="lg:col-span-4">
            <div className="border border-gray-200 p-3 sm:p-4 bg-white sticky top-20">
              <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">
                📋 Grupos por agendar
              </h2>
              
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {gruposPendientes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">✅ No hay grupos pendientes por agendar</p>
                ) : (
                  gruposPendientes.map((grupo) => (
                    <div key={grupo.id} className="border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-sm font-medium">{grupo.nombre}</h3>
                          <p className="text-[10px] text-gray-500">{grupo.institucionNombre}</p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            📅 Fecha: {grupo.fecha}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            👥 Clientes: {grupo.totalClientes}
                          </p>
                          {grupo.notas && (
                            <p className="text-[8px] text-gray-400 mt-1 italic">📝 {grupo.notas}</p>
                          )}
                        </div>
                        <button
                          onClick={() => abrirModalAgendar(grupo)}
                          className="bg-blue-600 text-white px-3 py-1 text-xs rounded hover:bg-blue-700 transition-colors"
                          disabled={guardando}
                        >
                          📅 Agendar hora
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* INSTITUCIONES CON FECHAS */}
            <div className="border border-gray-200 p-3 sm:p-4 bg-white mt-3 sm:mt-4">
              <h3 className="text-[10px] sm:text-xs font-medium text-gray-500 mb-2">🏫 Instituciones y fechas</h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {instituciones.map(inst => (
                  <div key={inst.id} className="border-b border-gray-100 pb-2">
                    <p className="text-xs font-medium">{inst.nombre}</p>
                    <p className="text-[10px] text-gray-500">📅 {inst.fecha}</p>
                    <p className="text-[8px] text-gray-400">👥 Grupos: {inst.grupos?.length || 0}</p>
                  </div>
                ))}
                {instituciones.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No hay instituciones registradas</p>
                )}
              </div>
            </div>
          </section>

          {/* COLUMNA DERECHA: AGENDA DE CITAS */}
          <section className="lg:col-span-8">
            <div className="border border-gray-200 p-3 sm:p-4 bg-white">
              <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">
                {vistaCalendario ? '📅 Vista calendario' : '⏰ Agenda de sesiones'}
              </h2>
              
              {vistaCalendario ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {eventosFiltrados.map((cita) => (
                    <div key={cita.id} className={`border p-2 sm:p-3 ${cita.finalizada ? 'bg-gray-50' : 'bg-white'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono text-xs sm:text-sm font-bold">{cita.hora}</span>
                          <p className="text-xs font-medium mt-1">{cita.grupoNombre}</p>
                          <p className="text-[10px] text-gray-500">{cita.institucionNombre}</p>
                          <p className="text-[8px] text-gray-400">📅 {cita.fecha}</p>
                          <p className="text-[8px] text-gray-400 truncate max-w-[180px]">👥 {cita.clientes?.substring(0, 50)}{cita.clientes?.length > 50 ? '...' : ''}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => abrirModalEditarHora(cita)}
                            className="text-[8px] text-gray-400 hover:text-blue-600"
                            title="Editar hora"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => toggleFinalizada(cita.id, cita.finalizada)}
                            className={`text-[8px] px-2 py-0.5 rounded ${
                              cita.finalizada ? 'bg-green-100 text-green-700' : 'border border-gray-200'
                            }`}
                          >
                            {cita.finalizada ? '✓' : '○'}
                          </button>
                          <button
                            onClick={() => eliminarCita(cita.id)}
                            className="text-[8px] text-gray-400 hover:text-red-600"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {eventosFiltrados.length === 0 && (
                    <p className="text-center text-gray-400 py-8 col-span-2">No hay citas agendadas</p>
                  )}
                </div>
              ) : (
                <div className="space-y-0 border-l border-gray-200 ml-2">
                  {eventosFiltrados.length === 0 ? (
                    <p className="pl-4 sm:pl-6 text-xs text-gray-400 italic">
                      No hay sesiones programadas
                    </p>
                  ) : (
                    eventosFiltrados.map((cita) => (
                      <div 
                        key={cita.id} 
                        className={`relative pl-4 sm:pl-6 pb-5 sm:pb-6 group transition-all ${
                          cita.finalizada ? 'opacity-50' : 'opacity-100'
                        }`}
                      >
                        <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${
                          cita.finalizada 
                            ? 'bg-gray-300 border border-gray-300' 
                            : 'bg-gray-900'
                        }`} />
                        
                        <div className="flex flex-col xs:flex-row xs:items-baseline gap-1 xs:gap-3 mb-1 sm:mb-2">
                          <span className={`text-base sm:text-lg font-light font-mono ${
                            cita.finalizada ? 'line-through text-gray-400' : ''
                          }`}>
                            {cita.hora}
                          </span>
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            {cita.institucionNombre}
                          </span>
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            📅 {cita.fecha}
                          </span>
                          {cita.registradoPor && (
                            <span className="text-[8px] sm:text-[10px] text-gray-400">
                              Reg: {cita.registradoPor}
                            </span>
                          )}
                        </div>
                        
                        <h3 className={`text-xs sm:text-sm font-medium mb-0.5 break-words pr-2 ${
                          cita.finalizada ? 'line-through text-gray-500' : ''
                        }`}>
                          {cita.grupoNombre}
                        </h3>
                        
                        <p className="text-[10px] sm:text-xs text-gray-500 mb-1 break-words">
                          {cita.clientes}
                        </p>

                        <div className="flex flex-wrap gap-2 sm:gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => abrirModalEditarHora(cita)}
                            className="text-[9px] sm:text-[10px] text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            Editar hora
                          </button>
                          <button 
                            onClick={() => toggleFinalizada(cita.id, cita.finalizada)}
                            className="text-[9px] sm:text-[10px] text-gray-500 hover:text-gray-900 transition-colors"
                          >
                            {cita.finalizada ? 'Reabrir sesión' : 'Marcar completada'}
                          </button>
                          <button 
                            onClick={() => eliminarCita(cita.id)}
                            className="text-[9px] sm:text-[10px] text-gray-400 hover:text-red-600 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* MODAL PARA AGENDAR HORA */}
        {modalAgendar && grupoSeleccionado && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium">⏰ Agendar hora - {grupoSeleccionado.nombre}</h3>
                <button 
                  onClick={() => {
                    setModalAgendar(false);
                    setGrupoSeleccionado(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={guardarAgendar} className="space-y-4">
                <div className="bg-gray-50 p-3 rounded space-y-2">
                  <p className="text-xs"><strong>Institución:</strong> {form.institucionNombre}</p>
                  <p className="text-xs"><strong>Fecha de sesión:</strong> {form.fecha}</p>
                  <p className="text-xs"><strong>Grupo:</strong> {form.grupoNombre}</p>
                  <p className="text-xs"><strong>Clientes:</strong> {form.cliente}</p>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Seleccionar hora *</label>
                  <select
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={form.hora}
                    onChange={(e) => setForm({...form, hora: e.target.value})}
                  >
                    <option value="">Seleccionar hora...</option>
                    <option value="09:00">09:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="12:00">12:00 PM</option>
                    <option value="13:00">01:00 PM</option>
                    <option value="14:00">02:00 PM</option>
                    <option value="15:00">03:00 PM</option>
                    <option value="16:00">04:00 PM</option>
                    <option value="17:00">05:00 PM</option>
                    <option value="18:00">06:00 PM</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {guardando ? '⏳ Agendando...' : '📅 Agendar Sesión'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalAgendar(false);
                      setGrupoSeleccionado(null);
                    }}
                    className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL PARA EDITAR HORA */}
        {modalEditarHora && citaEditando && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium">✏️ Editar hora - {citaEditando.grupoNombre}</h3>
                <button 
                  onClick={() => {
                    setModalEditarHora(false);
                    setCitaEditando(null);
                    setNuevaHora('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded space-y-2">
                  <p className="text-xs"><strong>Institución:</strong> {citaEditando.institucionNombre}</p>
                  <p className="text-xs"><strong>Fecha:</strong> {citaEditando.fecha}</p>
                  <p className="text-xs"><strong>Grupo:</strong> {citaEditando.grupoNombre}</p>
                  <p className="text-xs"><strong>Clientes:</strong> {citaEditando.clientes?.substring(0, 100)}</p>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nueva hora *</label>
                  <select
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={nuevaHora}
                    onChange={(e) => setNuevaHora(e.target.value)}
                  >
                    <option value="">Seleccionar hora...</option>
                    <option value="09:00">09:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="12:00">12:00 PM</option>
                    <option value="13:00">01:00 PM</option>
                    <option value="14:00">02:00 PM</option>
                    <option value="15:00">03:00 PM</option>
                    <option value="16:00">04:00 PM</option>
                    <option value="17:00">05:00 PM</option>
                    <option value="18:00">06:00 PM</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={guardarEdicionHora}
                    disabled={guardando}
                    className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {guardando ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                  <button
                    onClick={() => {
                      setModalEditarHora(false);
                      setCitaEditando(null);
                      setNuevaHora('');
                    }}
                    className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACCESOS RÁPIDOS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 sm:gap-2 mt-4 sm:mt-6">
          <Link href="/pedidos" className="bg-gray-900 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            📋 Planilla de Control
          </Link>
          <Link href="/administracion" className="bg-purple-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            ⚙️ Control Operaciones
          </Link>
          <Link href="/ventas" className="bg-blue-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            💰 Caja & Cobros
          </Link>
          <Link href="/acreditacion" className="bg-amber-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            🎫 QR Check
          </Link>
        </div>
      </div>
    </main>
  );
}
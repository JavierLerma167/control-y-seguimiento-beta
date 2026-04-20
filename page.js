// app/page.js (VERSIÓN COMPLETA - CON TODAS LAS FUNCIONALIDADES ORIGINALES)
"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from './providers/FirebaseProvider';

export default function Home() {
  const router = useRouter();
  const firebase = useFirebase();
  
  // Extraer todas las propiedades necesarias
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    crear, 
    actualizar, 
    eliminar, 
    suscribir,
    cerrarSesion,
    COLLECTIONS 
  } = firebase;

  // --- ESTADOS PRINCIPALES ---
  const [tareas, setTareas] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [cargado, setCargado] = useState(false);

  // --- ESTADOS UI ---
  const [modalActivo, setModalActivo] = useState(null);
  const [elementoEditando, setElementoEditando] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState({ show: false, tipo: null, id: null });
  const [busqueda, setBusqueda] = useState('');
  const [vistaGrafica, setVistaGrafica] = useState('semanal');

  // --- ESTADOS FORMULARIOS ---
  const [formTarea, setFormTarea] = useState({ titulo: '', descripcion: '', asignadoA: '', prioridad: 'media' });
  const [formVenta, setFormVenta] = useState({ cliente: '', producto: '', cantidad: 1, precio: 0 });
  const [formAgenda, setFormAgenda] = useState({ cliente: '', grupoNombre: '', fecha: '', hora: '' });
  const [formCliente, setFormCliente] = useState({ nombre: '', email: '', telefono: '', direccion: '', paquete: 'Básico' });
  const [formGasto, setFormGasto] = useState({ concepto: '', monto: '', categoria: '' });

  const esAdmin = usuario?.rol === 'admin';
  const isMounted = useRef(true);

  // Precios de paquetes
  const preciosPaquetes = {
    'Básico': 1500,
    'Premium': 3500,
    'Boda / Evento': 12000,
    'Sesión XV': 5000,
    'Corporativo': 8000
  };

  // Función segura para parsear fechas
  const parseFechaSegura = useCallback((fecha) => {
    if (!fecha) return null;
    try {
      const date = new Date(fecha);
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  }, []);

  // --- SUSCRIPCIONES EN TIEMPO REAL ---
  useEffect(() => {
    if (!usuario) return;

    // Suscripción a tareas
    const unsubTareas = suscribir(COLLECTIONS.TAREAS, (data) => {
      if (isMounted.current) setTareas(data || []);
    });

    // Suscripción a ventas
    const unsubVentas = suscribir(COLLECTIONS.VENTAS, (data) => {
      if (isMounted.current) setVentas(data || []);
    });

    // Suscripción a agenda
    const unsubAgenda = suscribir(COLLECTIONS.AGENDA, (data) => {
      if (isMounted.current) setAgenda(data || []);
    });

    // Suscripción a clientes
    const unsubClientes = suscribir(COLLECTIONS.CLIENTES, (data) => {
      if (isMounted.current) setClientes(data || []);
    });

    // Suscripción a gastos/finanzas
    const unsubGastos = suscribir(COLLECTIONS.FINANZAS, (data) => {
      if (isMounted.current && data) {
        const gastosFiltrados = data.filter(item => item.tipo === 'gasto');
        setGastos(gastosFiltrados);
      }
    });

    // Suscripción a pedidos - IMPORTANTE: Extraer datos de pedidos para estadísticas
    const unsubPedidos = suscribir(COLLECTIONS.PEDIDOS, (data) => {
      if (isMounted.current && data && data.length > 0) {
        const pedidoData = data[0];
        if (pedidoData && pedidoData.instituciones) {
          const todosLosPedidos = [];
          pedidoData.instituciones.forEach(inst => {
            inst.grupos?.forEach(grupo => {
              grupo.registros?.forEach(registro => {
                if (registro.cliente) {
                  const totalPaquetes = (Number(registro.cantPaquetes) || 0) * (Number(registro.costoPaquete) || 0);
                  const totalExtras = registro.extras?.reduce((sum, e) => sum + (Number(e.cant) * Number(e.precio)), 0) || 0;
                  const granTotal = totalPaquetes + totalExtras;
                  const anticipo = Number(registro.anticipo) || 0;
                  const pagado = granTotal - (granTotal - anticipo);
                  
                  todosLosPedidos.push({
                    ...registro,
                    institucionNombre: inst.nombre,
                    grupoNombre: grupo.nombre,
                    granTotal: granTotal,
                    saldo: granTotal - anticipo,
                    pagado: pagado,
                    fechaRegistro: registro.fechaRegistro || registro.fechaHora || registro.fecha || new Date().toISOString()
                  });
                }
              });
            });
          });
          setPedidos(todosLosPedidos);
        }
      }
    });

    // Suscripción a paquetes
    const unsubPaquetes = suscribir(COLLECTIONS.PAQUETES, (data) => {
      if (isMounted.current) setPaquetes(data || []);
    });

    setCargado(true);

    return () => {
      isMounted.current = false;
      unsubTareas();
      unsubVentas();
      unsubAgenda();
      unsubClientes();
      unsubGastos();
      unsubPedidos();
      unsubPaquetes();
    };
  }, [usuario, suscribir]);

  // --- CÁLCULOS GLOBALES BASADOS EN PEDIDOS ---
  const totalFacturadoPedidos = useMemo(() => 
    pedidos.reduce((acc, p) => acc + (p.granTotal || 0), 0), [pedidos]
  );

  const totalPagadoPedidos = useMemo(() => 
    pedidos.reduce((acc, p) => acc + (p.pagado || 0), 0), [pedidos]
  );

  const totalPendientePedidos = useMemo(() => 
    pedidos.reduce((acc, p) => acc + (p.saldo || 0), 0), [pedidos]
  );

  const totalIngresosCaja = useMemo(() => 
    ventas.reduce((acc, v) => acc + (v.total || 0), 0), [ventas]
  );

  const totalGastos = useMemo(() => 
    gastos.reduce((acc, g) => acc + (Number(g.monto) || 0), 0), [gastos]
  );

  const saldoCajaOp = totalIngresosCaja - totalGastos;

  // Estadísticas de producción (basadas en pedidos)
  const estadisticasProduccion = useMemo(() => ({
    toma: pedidos.filter(p => p.toma).length,
    edicion: pedidos.filter(p => p.edicion).length,
    impreso: pedidos.filter(p => p.impreso).length,
    empaquetado: pedidos.filter(p => p.empaquetado).length,
    entregado: pedidos.filter(p => p.entregado).length,
    total: pedidos.length
  }), [pedidos]);

  // --- DATOS PARA GRÁFICA (CORREGIDO - USA PEDIDOS) ---
  const datosGrafica = useMemo(() => {
    const ahora = new Date();
    const labels = [];
    const valores = [];
    
    // Función para obtener fecha del pedido de forma segura
    const getFechaPedido = (pedido) => {
      if (pedido.fechaRegistro) {
        const fecha = parseFechaSegura(pedido.fechaRegistro);
        if (fecha) return fecha;
      }
      if (pedido.fechaHora) {
        const fecha = parseFechaSegura(pedido.fechaHora);
        if (fecha) return fecha;
      }
      if (pedido.fecha) {
        const fecha = parseFechaSegura(pedido.fecha);
        if (fecha) return fecha;
      }
      return null;
    };
    
    // Determinar configuración según la vista
    let puntos = 7;
    let formato = 'dia';
    
    if (vistaGrafica === 'semanal') {
      puntos = 7;
      formato = 'dia';
    } else if (vistaGrafica === 'mensual') {
      puntos = 12;
      formato = 'mes';
    } else {
      puntos = 5;
      formato = 'anio';
    }
    
    for (let i = puntos - 1; i >= 0; i--) {
      let fecha = new Date(ahora);
      let label = '';
      
      if (formato === 'dia') {
        fecha.setDate(ahora.getDate() - i);
        label = fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
      } else if (formato === 'mes') {
        fecha.setMonth(ahora.getMonth() - i);
        label = fecha.toLocaleDateString('es-MX', { month: 'short' });
      } else {
        fecha.setFullYear(ahora.getFullYear() - i);
        label = fecha.getFullYear().toString();
      }
      
      labels.push(label);
      
      // Calcular valor basado en PEDIDOS (no en ventas)
      const valor = pedidos.filter(p => {
        const fechaPedido = getFechaPedido(p);
        if (!fechaPedido) return false;
        
        if (formato === 'dia') {
          return fechaPedido.toDateString() === fecha.toDateString();
        } else if (formato === 'mes') {
          return fechaPedido.getMonth() === fecha.getMonth() && 
                 fechaPedido.getFullYear() === fecha.getFullYear();
        } else {
          return fechaPedido.getFullYear() === fecha.getFullYear();
        }
      }).reduce((sum, p) => sum + (p.granTotal || 0), 0);
      
      valores.push(valor);
    }
    
    return { labels, valores };
  }, [pedidos, vistaGrafica, parseFechaSegura]);

  const maxValor = Math.max(...datosGrafica.valores, 1);

  // --- FUNCIONES CRUD DE TAREAS ---
  const agregarTarea = async (e) => {
    e.preventDefault();
    if (!formTarea.titulo || !formTarea.asignadoA) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const nuevaTarea = {
      titulo: formTarea.titulo,
      descripcion: formTarea.descripcion || '',
      asignadoA: formTarea.asignadoA,
      prioridad: formTarea.prioridad,
      estado: 'pendiente',
      creadoPor: usuario.id,
      creadoPorNombre: usuario.nombre,
      fechaCreacion: new Date().toISOString()
    };

    await crear(COLLECTIONS.TAREAS, nuevaTarea);
    setModalActivo(null);
    setFormTarea({ titulo: '', descripcion: '', asignadoA: '', prioridad: 'media' });
  };

  const editarTarea = (tarea) => {
    setElementoEditando(tarea);
    setFormTarea({
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || '',
      asignadoA: tarea.asignadoA,
      prioridad: tarea.prioridad || 'media'
    });
    setModalActivo('editarTarea');
  };

  const guardarEdicionTarea = async (e) => {
    e.preventDefault();
    await actualizar(COLLECTIONS.TAREAS, elementoEditando.id, {
      titulo: formTarea.titulo,
      descripcion: formTarea.descripcion,
      asignadoA: formTarea.asignadoA,
      prioridad: formTarea.prioridad,
      actualizadoEn: new Date().toISOString()
    });
    setModalActivo(null);
    setElementoEditando(null);
    setFormTarea({ titulo: '', descripcion: '', asignadoA: '', prioridad: 'media' });
  };

  const toggleTareaCompletada = async (id, tarea) => {
    const nuevoEstado = tarea.estado === 'completada' ? 'pendiente' : 'completada';
    await actualizar(COLLECTIONS.TAREAS, id, { 
      estado: nuevoEstado,
      fechaCompletada: nuevoEstado === 'completada' ? new Date().toISOString() : null
    });
  };

  // --- FUNCIONES CRUD DE VENTAS ---
  const agregarVenta = async (e) => {
    e.preventDefault();
    const nuevaVenta = {
      cliente: formVenta.cliente,
      producto: formVenta.producto,
      cantidad: Number(formVenta.cantidad),
      precio: Number(formVenta.precio),
      total: formVenta.cantidad * formVenta.precio,
      fecha: new Date().toISOString(),
      registradoPor: usuario.id,
      registradoPorNombre: usuario.nombre
    };
    await crear(COLLECTIONS.VENTAS, nuevaVenta);
    setModalActivo(null);
    setFormVenta({ cliente: '', producto: '', cantidad: 1, precio: 0 });
  };

  const eliminarVenta = async (id) => {
    setShowConfirmDelete({ show: true, tipo: 'venta', id });
  };

  // --- FUNCIONES CRUD DE AGENDA ---
  const agregarCita = async (e) => {
    e.preventDefault();
    const nuevaCita = {
      cliente: formAgenda.cliente,
      grupoNombre: formAgenda.grupoNombre,
      fecha: formAgenda.fecha,
      hora: formAgenda.hora,
      finalizada: false,
      fechaCreacion: new Date().toISOString(),
      registradoPor: usuario.id
    };
    await crear(COLLECTIONS.AGENDA, nuevaCita);
    setModalActivo(null);
    setFormAgenda({ cliente: '', grupoNombre: '', fecha: '', hora: '' });
  };

  const toggleCitaFinalizada = async (id, cita) => {
    await actualizar(COLLECTIONS.AGENDA, id, { 
      finalizada: !cita.finalizada,
      fechaFinalizacion: !cita.finalizada ? new Date().toISOString() : null
    });
  };

  // --- FUNCIONES CRUD DE CLIENTES ---
  const agregarCliente = async (e) => {
    e.preventDefault();
    const nuevoCliente = {
      nombre: formCliente.nombre,
      email: formCliente.email,
      telefono: formCliente.telefono,
      direccion: formCliente.direccion,
      paquete: formCliente.paquete,
      paquetePrecio: preciosPaquetes[formCliente.paquete],
      checkIn: false,
      fechaRegistro: new Date().toISOString(),
      registradoPor: usuario.id
    };
    await crear(COLLECTIONS.CLIENTES, nuevoCliente);
    setModalActivo(null);
    setFormCliente({ nombre: '', email: '', telefono: '', direccion: '', paquete: 'Básico' });
  };

  const toggleCheckIn = async (id, cliente) => {
    await actualizar(COLLECTIONS.CLIENTES, id, { 
      checkIn: !cliente.checkIn,
      fechaCheckIn: !cliente.checkIn ? new Date().toISOString() : null
    });
  };

  // --- FUNCIONES CRUD DE GASTOS ---
  const agregarGasto = async (e) => {
    e.preventDefault();
    const nuevoGasto = {
      concepto: formGasto.concepto,
      monto: Number(formGasto.monto),
      categoria: formGasto.categoria,
      tipo: 'gasto',
      fecha: new Date().toISOString(),
      registradoPor: usuario.id
    };
    await crear(COLLECTIONS.FINANZAS, nuevoGasto);
    setModalActivo(null);
    setFormGasto({ concepto: '', monto: '', categoria: '' });
  };

  // --- ELIMINAR GENÉRICO ---
  const confirmarEliminar = async () => {
    const { tipo, id } = showConfirmDelete;
    
    try {
      let collection;
      switch (tipo) {
        case 'tarea':
          collection = COLLECTIONS.TAREAS;
          break;
        case 'venta':
          collection = COLLECTIONS.VENTAS;
          break;
        case 'agenda':
          collection = COLLECTIONS.AGENDA;
          break;
        case 'cliente':
          collection = COLLECTIONS.CLIENTES;
          break;
        case 'gasto':
          collection = COLLECTIONS.FINANZAS;
          break;
        default:
          return;
      }
      await eliminar(collection, id);
    } catch (error) {
      console.error('Error eliminando:', error);
      alert('Error al eliminar');
    }
    
    setShowConfirmDelete({ show: false, tipo: null, id: null });
  };

  // --- FILTROS DE BÚSQUEDA ---
  const tareasFiltradas = useMemo(() => 
    tareas.filter(t => 
      t.titulo?.toLowerCase().includes(busqueda.toLowerCase()) ||
      t.asignadoA?.toLowerCase().includes(busqueda.toLowerCase())
    ), [tareas, busqueda]
  );

  const pedidosFiltrados = useMemo(() => 
    pedidos.filter(p => 
      p.cliente?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.grupoNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.institucionNombre?.toLowerCase().includes(busqueda.toLowerCase())
    ), [pedidos, busqueda]
  );

  const clientesFiltrados = useMemo(() => 
    clientes.filter(c => 
      c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.paquete?.toLowerCase().includes(busqueda.toLowerCase())
    ), [clientes, busqueda]
  );

  const ventasFiltradas = useMemo(() => 
    ventas.filter(v => 
      v.cliente?.toLowerCase().includes(busqueda.toLowerCase()) ||
      v.producto?.toLowerCase().includes(busqueda.toLowerCase())
    ), [ventas, busqueda]
  );

  const agendaFiltrada = useMemo(() => 
    agenda.filter(a => 
      a.cliente?.toLowerCase().includes(busqueda.toLowerCase()) ||
      a.grupoNombre?.toLowerCase().includes(busqueda.toLowerCase())
    ), [agenda, busqueda]
  );

  // Protección de ruta
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // Función para cerrar sesión
  const handleLogout = async () => {
    try {
      if (cerrarSesion && typeof cerrarSesion === 'function') {
        await cerrarSesion();
      }
      
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/auth';
      
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/auth';
    }
  };

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
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
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-light">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">Control EVR pro</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1">
              <p className="text-[10px] sm:text-xs text-gray-400">Studio Management / 2026</p>
              {esAdmin && (
                <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Administrador
                </span>
              )}
              {usuario && (
                <span className="text-[10px] sm:text-xs text-gray-500">
                  {usuario.nombre || usuario.email}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="w-full md:w-64">
              <input 
                type="text" 
                placeholder="Buscar en todos los módulos..." 
                className="w-full border border-gray-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button
              onClick={handleLogout}
              className="border border-gray-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* KPIS - AHORA CON DATOS DE PEDIDOS */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-2 mb-4 sm:mb-6">
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Facturado</p>
            <p className="text-xs sm:text-base font-light">${totalFacturadoPedidos.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Por cobrar</p>
            <p className="text-xs sm:text-base font-light text-red-600">${totalPendientePedidos.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 bg-gray-50">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Caja op.</p>
            <p className="text-xs sm:text-base font-light">${saldoCajaOp.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Pedidos</p>
            <p className="text-xs sm:text-base font-light">{estadisticasProduccion.total}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Clientes</p>
            <p className="text-xs sm:text-base font-light">{clientes.length}</p>
          </div>
          <div className="border border-gray-900 p-2 sm:p-3 bg-gray-900 text-white">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Gastos</p>
            <p className="text-xs sm:text-base font-light">-${totalGastos.toLocaleString()}</p>
          </div>
        </section>

        {/* GRÁFICA - AHORA CON DATOS DE PEDIDOS */}
        <section className="border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">
              📊 Ingresos por Pedidos
            </h2>
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => setVistaGrafica('semanal')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${vistaGrafica === 'semanal' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Semanal
              </button>
              <button
                onClick={() => setVistaGrafica('mensual')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${vistaGrafica === 'mensual' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Mensual
              </button>
              <button
                onClick={() => setVistaGrafica('anual')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${vistaGrafica === 'anual' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Anual
              </button>
            </div>
          </div>
          
          <div>
            <p className="text-[8px] sm:text-[10px] text-gray-500 mb-1">Facturación (MXN)</p>
            <div className="flex items-end gap-1 h-24 sm:h-32">
              {datosGrafica.valores.map((valor, i) => {
                const height = maxValor > 0 ? (valor / maxValor) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group">
                    <div 
                      className="w-full bg-blue-600 hover:bg-blue-700 transition-all duration-200 rounded-t relative"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    >
                      <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[8px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        ${valor.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-[6px] sm:text-[8px] text-gray-400 mt-1 truncate w-full text-center">
                      {datosGrafica.labels[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="mt-3 pt-2 border-t border-gray-100 text-[8px] sm:text-[10px] text-gray-400 text-center">
            Total facturado período: ${datosGrafica.valores.reduce((a, b) => a + b, 0).toLocaleString()}
          </div>
        </section>

        {/* ESTADÍSTICAS DE PRODUCCIÓN */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-1 sm:gap-2 mb-4 sm:mb-6">
          <div className="border border-gray-200 p-2 sm:p-3 text-center">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Toma</p>
            <p className="text-sm sm:text-base font-medium">{estadisticasProduccion.toma}/{estadisticasProduccion.total}</p>
            <div className="w-full h-0.5 bg-gray-100 mt-1">
              <div className="h-0.5 bg-gray-900" style={{ width: `${estadisticasProduccion.total ? (estadisticasProduccion.toma / estadisticasProduccion.total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 text-center">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Edición</p>
            <p className="text-sm sm:text-base font-medium">{estadisticasProduccion.edicion}/{estadisticasProduccion.total}</p>
            <div className="w-full h-0.5 bg-gray-100 mt-1">
              <div className="h-0.5 bg-gray-900" style={{ width: `${estadisticasProduccion.total ? (estadisticasProduccion.edicion / estadisticasProduccion.total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 text-center">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Impresión</p>
            <p className="text-sm sm:text-base font-medium">{estadisticasProduccion.impreso}/{estadisticasProduccion.total}</p>
            <div className="w-full h-0.5 bg-gray-100 mt-1">
              <div className="h-0.5 bg-gray-900" style={{ width: `${estadisticasProduccion.total ? (estadisticasProduccion.impreso / estadisticasProduccion.total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 text-center">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Empaque</p>
            <p className="text-sm sm:text-base font-medium">{estadisticasProduccion.empaquetado}/{estadisticasProduccion.total}</p>
            <div className="w-full h-0.5 bg-gray-100 mt-1">
              <div className="h-0.5 bg-gray-900" style={{ width: `${estadisticasProduccion.total ? (estadisticasProduccion.empaquetado / estadisticasProduccion.total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 text-center bg-green-50">
            <p className="text-[8px] sm:text-[10px] text-gray-400">Entregado</p>
            <p className="text-sm sm:text-base font-medium text-green-700">{estadisticasProduccion.entregado}/{estadisticasProduccion.total}</p>
            <div className="w-full h-0.5 bg-gray-100 mt-1">
              <div className="h-0.5 bg-green-600" style={{ width: `${estadisticasProduccion.total ? (estadisticasProduccion.entregado / estadisticasProduccion.total) * 100 : 0}%` }} />
            </div>
          </div>
        </section>

        {/* SECCIÓN PRINCIPAL - TRES COLUMNAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          
          {/* COLUMNA IZQUIERDA - TAREAS Y GASTOS */}
          <div className="space-y-3 sm:space-y-4">
            
            {/* TAREAS */}
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Tareas</h2>
                <button
                  onClick={() => setModalActivo('nuevaTarea')}
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  + Nueva
                </button>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-1">
                {tareasFiltradas.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-[10px] sm:text-xs border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                      <input 
                        type="checkbox" 
                        checked={t.estado === 'completada'}
                        onChange={() => toggleTareaCompletada(t.id, t)}
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`truncate ${t.estado === 'completada' ? 'line-through text-gray-400' : 'font-medium'}`}>
                          {t.titulo}
                        </p>
                        <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{t.asignadoA}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
                      <button onClick={() => editarTarea(t)} className="text-gray-400 hover:text-blue-600 px-1">✎</button>
                      <button onClick={() => setShowConfirmDelete({ show: true, tipo: 'tarea', id: t.id })} className="text-gray-400 hover:text-red-600 px-1">✕</button>
                    </div>
                  </div>
                ))}
                {tareasFiltradas.length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay tareas</p>
                )}
              </div>
            </div>

            {/* GASTOS */}
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Gastos</h2>
                <button
                  onClick={() => setModalActivo('nuevoGasto')}
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  + Nuevo
                </button>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-1">
                {gastos.slice(0, 5).map(g => (
                  <div key={g.id} className="flex justify-between items-center text-[10px] sm:text-xs border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{g.concepto}</p>
                      <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{new Date(g.fecha).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
                      <span className="text-red-600 font-mono">-${g.monto}</span>
                      <button onClick={() => setShowConfirmDelete({ show: true, tipo: 'gasto', id: g.id })} className="text-gray-400 hover:text-red-600 px-1">✕</button>
                    </div>
                  </div>
                ))}
                {gastos.length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay gastos</p>
                )}
              </div>
            </div>
          </div>

          {/* COLUMNA CENTRAL - PEDIDOS */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4">
            
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Pedidos activos</h2>
                <Link 
                  href="/pedidos"
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  Gestionar
                </Link>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[350px] sm:max-h-[400px] overflow-y-auto pr-1">
                {pedidosFiltrados.slice(0, 8).map(p => (
                  <div key={p.id} className="border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] sm:text-xs font-medium truncate">{p.cliente || 'Sin nombre'}</p>
                        <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{p.grupoNombre}</p>
                        {p.institucionNombre && (
                          <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{p.institucionNombre}</p>
                        )}
                      </div>
                      <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
                        <span className={`text-[8px] sm:text-[10px] px-1 py-0.5 rounded ${
                          p.entregado ? 'bg-green-100 text-green-700' :
                          p.empaquetado ? 'bg-purple-100 text-purple-700' :
                          p.impreso ? 'bg-orange-100 text-orange-700' :
                          p.edicion ? 'bg-blue-100 text-blue-700' :
                          p.toma ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {p.entregado ? 'Entregado' :
                           p.empaquetado ? 'Empaque' :
                           p.impreso ? 'Impresión' :
                           p.edicion ? 'Edición' :
                           p.toma ? 'Toma' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1 sm:mt-2">
                      <div className="flex gap-0.5 sm:gap-1">
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 text-[6px] sm:text-[8px] border flex items-center justify-center ${p.toma ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>T</div>
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 text-[6px] sm:text-[8px] border flex items-center justify-center ${p.edicion ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>E</div>
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 text-[6px] sm:text-[8px] border flex items-center justify-center ${p.impreso ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>I</div>
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 text-[6px] sm:text-[8px] border flex items-center justify-center ${p.empaquetado ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>M</div>
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 text-[6px] sm:text-[8px] border flex items-center justify-center ${p.entregado ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>EN</div>
                      </div>
                      <span className={`text-[8px] sm:text-[10px] font-mono ${(p.saldo || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ${(p.saldo || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {pedidosFiltrados.length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay pedidos</p>
                )}
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA - VENTAS, CLIENTES Y AGENDA */}
          <div className="space-y-3 sm:space-y-4">
            
            {/* VENTAS */}
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Ventas recientes</h2>
                <button
                  onClick={() => setModalActivo('nuevaVenta')}
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  + Nueva
                </button>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-1">
                {ventasFiltradas.slice(0, 5).map(v => (
                  <div key={v.id} className="flex justify-between items-center text-[10px] sm:text-xs border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{v.cliente}</p>
                      <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{v.producto} x{v.cantidad}</p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
                      <span className="font-mono text-green-600">+${v.total}</span>
                      <button onClick={() => setShowConfirmDelete({ show: true, tipo: 'venta', id: v.id })} className="text-gray-400 hover:text-red-600 px-1">✕</button>
                    </div>
                  </div>
                ))}
                {ventasFiltradas.length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay ventas</p>
                )}
              </div>
            </div>

            {/* CLIENTES */}
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Clientes</h2>
                <button
                  onClick={() => setModalActivo('nuevoCliente')}
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  + Nuevo
                </button>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-1">
                {clientesFiltrados.slice(0, 5).map(c => (
                  <div key={c.id} className="flex justify-between items-center text-[10px] sm:text-xs border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.nombre}</p>
                      <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{c.paquete}</p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleCheckIn(c.id, c)}
                        className={`text-[8px] sm:text-[10px] px-1 sm:px-2 py-0.5 border ${c.checkIn ? 'bg-gray-900 text-white' : ''}`}
                      >
                        {c.checkIn ? '✓' : '○'}
                      </button>
                      <button onClick={() => setShowConfirmDelete({ show: true, tipo: 'cliente', id: c.id })} className="text-gray-400 hover:text-red-600 px-1">✕</button>
                    </div>
                  </div>
                ))}
                {clientesFiltrados.length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay clientes</p>
                )}
              </div>
            </div>

            {/* AGENDA */}
            <div className="border border-gray-200 p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">Próximas citas</h2>
                <button
                  onClick={() => setModalActivo('nuevaAgenda')}
                  className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 py-0.5 sm:py-1 hover:bg-gray-800"
                >
                  + Nueva
                </button>
              </div>
              
              <div className="space-y-1 sm:space-y-2 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-1">
                {agendaFiltrada.filter(e => !e.finalizada).slice(0, 5).map(e => (
                  <div key={e.id} className="flex justify-between items-center text-[10px] sm:text-xs border border-gray-100 p-1.5 sm:p-2 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{e.cliente}</p>
                      <p className="text-[8px] sm:text-[10px] text-gray-400 truncate">{e.hora} • {e.grupoNombre}</p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleCitaFinalizada(e.id, e)}
                        className="text-[8px] sm:text-[10px] border border-gray-200 px-1 sm:px-2 py-0.5 hover:bg-gray-100"
                      >
                        ✓
                      </button>
                      <button onClick={() => setShowConfirmDelete({ show: true, tipo: 'agenda', id: e.id })} className="text-gray-400 hover:text-red-600 px-1">✕</button>
                    </div>
                  </div>
                ))}
                {agendaFiltrada.filter(e => !e.finalizada).length === 0 && (
                  <p className="text-[10px] sm:text-xs text-gray-400 text-center py-3">No hay citas próximas</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ACCESOS RÁPIDOS */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1 sm:gap-2 mt-4 sm:mt-6">
          <Link href="/pedidos" className="bg-gray-900 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            Planilla
          </Link>
          <Link href="/administracion" className="bg-purple-600 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            Operaciones
          </Link>
          <Link href="/ventas" className="bg-blue-600 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            Caja
          </Link>
          <Link href="/agenda" className="bg-emerald-600 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            Agenda
          </Link>
          <Link href="/acreditacion" className="bg-amber-600 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            QR Check
          </Link>
          <Link href="/paquetes" className="bg-rose-600 text-white px-1 sm:px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs truncate">
            Paquetes
          </Link>
        </div>

        {/* MODALES - Formularios CRUD */}
        {/* Modal de Tarea */}
        {modalActivo === 'nuevaTarea' && (
          <ModalForm title="Nueva Tarea" onClose={() => setModalActivo(null)}>
            <form onSubmit={agregarTarea} className="space-y-4">
              <input type="text" placeholder="Título *" required className="w-full border p-2 text-sm"
                value={formTarea.titulo} onChange={(e) => setFormTarea({...formTarea, titulo: e.target.value})} />
              <textarea placeholder="Descripción" className="w-full border p-2 text-sm"
                value={formTarea.descripcion} onChange={(e) => setFormTarea({...formTarea, descripcion: e.target.value})} rows={2} />
              <input type="text" placeholder="Asignado a (ID de empleado) *" required className="w-full border p-2 text-sm"
                value={formTarea.asignadoA} onChange={(e) => setFormTarea({...formTarea, asignadoA: e.target.value})} />
              <select className="w-full border p-2 text-sm"
                value={formTarea.prioridad} onChange={(e) => setFormTarea({...formTarea, prioridad: e.target.value})}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Crear Tarea</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Venta */}
        {modalActivo === 'nuevaVenta' && (
          <ModalForm title="Nueva Venta" onClose={() => setModalActivo(null)}>
            <form onSubmit={agregarVenta} className="space-y-4">
              <input type="text" placeholder="Cliente *" required className="w-full border p-2 text-sm"
                value={formVenta.cliente} onChange={(e) => setFormVenta({...formVenta, cliente: e.target.value})} />
              <input type="text" placeholder="Producto *" required className="w-full border p-2 text-sm"
                value={formVenta.producto} onChange={(e) => setFormVenta({...formVenta, producto: e.target.value})} />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Cantidad" required className="border p-2 text-sm"
                  value={formVenta.cantidad} onChange={(e) => setFormVenta({...formVenta, cantidad: Number(e.target.value)})} />
                <input type="number" placeholder="Precio" required className="border p-2 text-sm"
                  value={formVenta.precio} onChange={(e) => setFormVenta({...formVenta, precio: Number(e.target.value)})} />
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Registrar Venta</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Cliente */}
        {modalActivo === 'nuevoCliente' && (
          <ModalForm title="Nuevo Cliente" onClose={() => setModalActivo(null)}>
            <form onSubmit={agregarCliente} className="space-y-4">
              <input type="text" placeholder="Nombre completo *" required className="w-full border p-2 text-sm"
                value={formCliente.nombre} onChange={(e) => setFormCliente({...formCliente, nombre: e.target.value})} />
              <input type="email" placeholder="Email" className="w-full border p-2 text-sm"
                value={formCliente.email} onChange={(e) => setFormCliente({...formCliente, email: e.target.value})} />
              <input type="tel" placeholder="Teléfono" className="w-full border p-2 text-sm"
                value={formCliente.telefono} onChange={(e) => setFormCliente({...formCliente, telefono: e.target.value})} />
              <input type="text" placeholder="Dirección" className="w-full border p-2 text-sm"
                value={formCliente.direccion} onChange={(e) => setFormCliente({...formCliente, direccion: e.target.value})} />
              <select className="w-full border p-2 text-sm"
                value={formCliente.paquete} onChange={(e) => setFormCliente({...formCliente, paquete: e.target.value})}>
                {Object.keys(preciosPaquetes).map(p => <option key={p} value={p}>{p} - ${preciosPaquetes[p]}</option>)}
              </select>
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Registrar Cliente</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Agenda */}
        {modalActivo === 'nuevaAgenda' && (
          <ModalForm title="Nueva Cita" onClose={() => setModalActivo(null)}>
            <form onSubmit={agregarCita} className="space-y-4">
              <input type="text" placeholder="Cliente *" required className="w-full border p-2 text-sm"
                value={formAgenda.cliente} onChange={(e) => setFormAgenda({...formAgenda, cliente: e.target.value})} />
              <input type="text" placeholder="Grupo / Sesión *" required className="w-full border p-2 text-sm"
                value={formAgenda.grupoNombre} onChange={(e) => setFormAgenda({...formAgenda, grupoNombre: e.target.value})} />
              <input type="date" required className="w-full border p-2 text-sm"
                value={formAgenda.fecha} onChange={(e) => setFormAgenda({...formAgenda, fecha: e.target.value})} />
              <input type="time" required className="w-full border p-2 text-sm"
                value={formAgenda.hora} onChange={(e) => setFormAgenda({...formAgenda, hora: e.target.value})} />
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Agendar Cita</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Gasto */}
        {modalActivo === 'nuevoGasto' && (
          <ModalForm title="Nuevo Gasto" onClose={() => setModalActivo(null)}>
            <form onSubmit={agregarGasto} className="space-y-4">
              <input type="text" placeholder="Concepto *" required className="w-full border p-2 text-sm"
                value={formGasto.concepto} onChange={(e) => setFormGasto({...formGasto, concepto: e.target.value})} />
              <input type="number" placeholder="Monto *" required className="w-full border p-2 text-sm"
                value={formGasto.monto} onChange={(e) => setFormGasto({...formGasto, monto: e.target.value})} />
              <select className="w-full border p-2 text-sm"
                value={formGasto.categoria} onChange={(e) => setFormGasto({...formGasto, categoria: e.target.value})}>
                <option value="">Seleccionar categoría</option>
                <option value="materiales">Materiales</option>
                <option value="equipo">Equipo</option>
                <option value="servicios">Servicios</option>
                <option value="otros">Otros</option>
              </select>
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Registrar Gasto</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Edición de Tarea */}
        {modalActivo === 'editarTarea' && (
          <ModalForm title="Editar Tarea" onClose={() => setModalActivo(null)}>
            <form onSubmit={guardarEdicionTarea} className="space-y-4">
              <input type="text" placeholder="Título *" required className="w-full border p-2 text-sm"
                value={formTarea.titulo} onChange={(e) => setFormTarea({...formTarea, titulo: e.target.value})} />
              <textarea placeholder="Descripción" className="w-full border p-2 text-sm"
                value={formTarea.descripcion} onChange={(e) => setFormTarea({...formTarea, descripcion: e.target.value})} rows={2} />
              <input type="text" placeholder="Asignado a (ID de empleado) *" required className="w-full border p-2 text-sm"
                value={formTarea.asignadoA} onChange={(e) => setFormTarea({...formTarea, asignadoA: e.target.value})} />
              <select className="w-full border p-2 text-sm"
                value={formTarea.prioridad} onChange={(e) => setFormTarea({...formTarea, prioridad: e.target.value})}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
              <button type="submit" className="w-full bg-gray-900 text-white py-2">Guardar Cambios</button>
            </form>
          </ModalForm>
        )}

        {/* Modal de Confirmación de Eliminación */}
        {showConfirmDelete.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white max-w-sm w-full p-6">
              <h3 className="text-sm font-medium mb-4">Confirmar eliminación</h3>
              <p className="text-xs text-gray-600 mb-6">¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={confirmarEliminar} className="flex-1 bg-red-600 text-white py-2 text-sm hover:bg-red-700">Eliminar</button>
                <button onClick={() => setShowConfirmDelete({ show: false, tipo: null, id: null })} className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Componente Modal reutilizable
function ModalForm({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
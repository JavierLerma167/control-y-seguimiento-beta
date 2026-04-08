// app/ventas/page.js
"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

export default function VentasPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    crear, 
    eliminar, 
    suscribir, 
    actualizar, 
    COLLECTIONS 
  } = useFirebase();

  const [ventas, setVentas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidosDocId, setPedidosDocId] = useState(null);
  const [form, setForm] = useState({ 
    id: '', 
    clienteId: '', 
    cliente: '', 
    producto: '', 
    cantidad: 1, 
    precio: 0, 
    pedidoId: '',
    institucion: '',
    grupo: '',
    paquete: '',
    total: 0
  });
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendientes');
  const [vistaGrafica, setVistaGrafica] = useState('mensual');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [pedidoEditando, setPedidoEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  
  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 20;

  const esAdmin = usuario?.rol === 'admin';

  // --- FUNCIÓN PARA ACTUALIZAR PEDIDO EN FIREBASE ---
  const actualizarPedidoEnFirebase = useCallback(async (pedidoId, cambios) => {
    if (!usuario || !esAdmin) return false;
    if (!pedidosDocId) return false;

    try {
      const pedidosDoc = await leerTodos(COLLECTIONS.PEDIDOS);
      if (!pedidosDoc || pedidosDoc.length === 0) return false;
      
      const data = pedidosDoc[0];
      const docId = pedidosDoc[0].id;
      
      const nuevasInstituciones = data.instituciones.map(inst => ({
        ...inst,
        grupos: inst.grupos.map(grupo => ({
          ...grupo,
          registros: grupo.registros.map(registro => 
            registro.id === pedidoId 
              ? { ...registro, ...cambios }
              : registro
          )
        }))
      }));
      
      await actualizar(COLLECTIONS.PEDIDOS, docId, { 
        instituciones: nuevasInstituciones,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario.nombre
      });
      
      return true;
    } catch (error) {
      console.error('Error actualizando pedido:', error);
      return false;
    }
  }, [usuario, esAdmin, pedidosDocId, leerTodos, actualizar]);

  // --- FUNCIÓN PARA ELIMINAR PEDIDO DE FIREBASE ---
  const eliminarPedidoDeFirebase = useCallback(async (pedidoId) => {
    if (!usuario || !esAdmin) return false;
    if (!pedidosDocId) return false;

    try {
      const pedidosDoc = await leerTodos(COLLECTIONS.PEDIDOS);
      if (!pedidosDoc || pedidosDoc.length === 0) return false;
      
      const data = pedidosDoc[0];
      const docId = pedidosDoc[0].id;
      
      const nuevasInstituciones = data.instituciones.map(inst => ({
        ...inst,
        grupos: inst.grupos.map(grupo => ({
          ...grupo,
          registros: grupo.registros.filter(registro => registro.id !== pedidoId)
        }))
      }));
      
      await actualizar(COLLECTIONS.PEDIDOS, docId, { 
        instituciones: nuevasInstituciones,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario.nombre
      });
      
      return true;
    } catch (error) {
      console.error('Error eliminando pedido:', error);
      return false;
    }
  }, [usuario, esAdmin, pedidosDocId, leerTodos, actualizar]);

  // --- CARGAR PEDIDOS DESDE FIREBASE ---
  const cargarPedidos = useCallback(async () => {
    const pedidosData = await leerTodos(COLLECTIONS.PEDIDOS);
    if (pedidosData && pedidosData.length > 0) {
      setPedidosDocId(pedidosData[0].id);
      const data = pedidosData[0];
      if (data && data.instituciones) {
        const todosLosPedidos = [];
        data.instituciones.forEach(inst => {
          inst.grupos?.forEach(grupo => {
            grupo.registros?.forEach(registro => {
              if (registro.cliente && registro.cliente.trim() !== '') {
                const totalPaquetes = (Number(registro.cantPaquetes) || 0) * (Number(registro.costoPaquete) || 0);
                const totalExtras = registro.extras?.reduce((sum, e) => sum + (Number(e.cant) * Number(e.precio)), 0) || 0;
                const granTotal = totalPaquetes + totalExtras;
                const anticipo = Number(registro.anticipo) || 0;
                const saldo = granTotal - anticipo;
                const pagadoCompleto = registro.pagadoCompleto || false;
                
                todosLosPedidos.push({
                  id: registro.id,
                  cliente: registro.cliente,
                  clienteId: registro.id,
                  paquete: registro.paquete || registro.paquetePersonalizado || 'Paquete',
                  total: granTotal,
                  anticipo: anticipo,
                  saldo: saldo,
                  pagadoCompleto: pagadoCompleto,
                  institucion: inst.nombre,
                  grupo: grupo.nombre,
                  fecha: registro.fecha || new Date().toLocaleDateString(),
                  fechaRegistro: registro.fechaRegistro || new Date().toLocaleDateString(),
                  cantPaquetes: registro.cantPaquetes,
                  costoPaquete: registro.costoPaquete,
                  extras: registro.extras || []
                });
              }
            });
          });
        });
        
        const pedidosOrdenados = todosLosPedidos.sort((a, b) => 
          new Date(b.fechaRegistro) - new Date(a.fechaRegistro)
        );
        setPedidos(pedidosOrdenados);
      }
    }
  }, [leerTodos]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.PEDIDOS, (data) => {
      if (data && data.length > 0) {
        cargarPedidos();
      }
      setCargado(true);
      setSincronizando(false);
    });
    
    return () => unsubscribe();
  }, [usuario, suscribir, cargarPedidos]);

  // --- CARGAR VENTAS ---
  useEffect(() => {
    if (!usuario) return;
    
    const unsubscribe = suscribir(COLLECTIONS.VENTAS, (data) => {
      if (data) {
        const ventasOrdenadas = data.sort((a, b) => 
          new Date(b.fechaISO || b.fecha) - new Date(a.fechaISO || a.fecha)
        );
        setVentas(ventasOrdenadas);
      }
    });
    
    return () => unsubscribe();
  }, [usuario, suscribir]);

  // --- ESTADÍSTICAS MEMOIZADAS ---
  const estadisticas = useMemo(() => {
    const hoy = new Date().toLocaleDateString();
    const semana = new Date();
    semana.setDate(semana.getDate() - 7);
    const mes = new Date();
    mes.setDate(mes.getDate() - 30);
    const anio = new Date();
    anio.setFullYear(anio.getFullYear() - 1);

    const ventasHoy = ventas.filter(v => v.fecha?.includes(hoy));
    const ventasSemana = ventas.filter(v => new Date(v.fechaISO || v.fecha) >= semana);
    const ventasMes = ventas.filter(v => new Date(v.fechaISO || v.fecha) >= mes);
    const ventasAnio = ventas.filter(v => new Date(v.fechaISO || v.fecha) >= anio);

    const pedidosPendientes = pedidos.filter(p => p.saldo > 0 && !p.pagadoCompleto);
    const totalPorCobrar = pedidosPendientes.reduce((sum, p) => sum + p.saldo, 0);
    const totalPagado = pedidos.filter(p => p.pagadoCompleto).reduce((sum, p) => sum + p.total, 0);

    return {
      totalHoy: ventasHoy.reduce((sum, v) => sum + v.total, 0),
      totalSemana: ventasSemana.reduce((sum, v) => sum + v.total, 0),
      totalMes: ventasMes.reduce((sum, v) => sum + v.total, 0),
      totalAnio: ventasAnio.reduce((sum, v) => sum + v.total, 0),
      promedioVenta: ventas.length > 0 ? ventas.reduce((sum, v) => sum + v.total, 0) / ventas.length : 0,
      transaccionesHoy: ventasHoy.length,
      pendientesCobro: pedidosPendientes.length,
      totalPorCobrar: totalPorCobrar,
      totalPagado: totalPagado
    };
  }, [ventas, pedidos]);

  // --- DATOS PARA GRÁFICAS CON DATOS REALES ---
  const datosGrafica = useMemo(() => {
    const ahora = new Date();
    let etiquetas = [];
    let valores = [];
    
    if (vistaGrafica === 'semanal') {
      for (let i = 6; i >= 0; i--) {
        const fecha = new Date(ahora);
        fecha.setDate(ahora.getDate() - i);
        etiquetas.push(fecha.toLocaleDateString('es-MX', { weekday: 'short' }));
      }
    } else if (vistaGrafica === 'mensual') {
      for (let i = 11; i >= 0; i--) {
        const fecha = new Date(ahora);
        fecha.setMonth(ahora.getMonth() - i);
        etiquetas.push(fecha.toLocaleDateString('es-MX', { month: 'short' }));
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const fecha = new Date(ahora);
        fecha.setFullYear(ahora.getFullYear() - i);
        etiquetas.push(fecha.getFullYear().toString());
      }
    }
    
    // Datos reales basados en ventas
    valores = etiquetas.map((_, i) => {
      const fechaActual = new Date();
      let fechaComparar;
      
      if (vistaGrafica === 'semanal') {
        fechaComparar = new Date(fechaActual);
        fechaComparar.setDate(fechaActual.getDate() - (6 - i));
      } else if (vistaGrafica === 'mensual') {
        fechaComparar = new Date(fechaActual);
        fechaComparar.setMonth(fechaActual.getMonth() - (11 - i));
      } else {
        fechaComparar = new Date(fechaActual);
        fechaComparar.setFullYear(fechaActual.getFullYear() - (4 - i));
      }
      
      return ventas
        .filter(v => {
          const fechaVenta = new Date(v.fechaISO || v.fecha);
          if (vistaGrafica === 'semanal') {
            return fechaVenta.toDateString() === fechaComparar.toDateString();
          } else if (vistaGrafica === 'mensual') {
            return fechaVenta.getMonth() === fechaComparar.getMonth() &&
                   fechaVenta.getFullYear() === fechaComparar.getFullYear();
          } else {
            return fechaVenta.getFullYear() === fechaComparar.getFullYear();
          }
        })
        .reduce((sum, v) => sum + (v.total || 0), 0);
    });
    
    return { labels: etiquetas, values: valores };
  }, [ventas, vistaGrafica]);

  const maxValor = Math.max(...datosGrafica.values, 1);

  // --- ABRIR MODAL PARA EDITAR PEDIDO ---
  const abrirEditarPedido = (pedido) => {
    setPedidoEditando(pedido);
    setForm({
      id: pedido.id,
      clienteId: pedido.clienteId,
      cliente: pedido.cliente,
      producto: pedido.paquete,
      cantidad: pedido.cantPaquetes || 1,
      precio: pedido.costoPaquete || 0,
      pedidoId: pedido.id,
      institucion: pedido.institucion,
      grupo: pedido.grupo,
      paquete: pedido.paquete,
      total: pedido.total
    });
    setModoEdicion(true);
    setMostrarFormulario(true);
  };

  // --- GUARDAR PEDIDO EDITADO ---
  const guardarEdicionPedido = async (e) => {
    e.preventDefault();
    if (!form.cliente || !form.producto) {
      alert('Complete todos los campos correctamente');
      return;
    }

    setGuardando(true);
    
    try {
      const nuevoTotal = form.cantidad * form.precio;
      const pedidoActual = pedidos.find(p => p.id === form.id);
      const nuevoSaldo = nuevoTotal - (pedidoActual?.anticipo || 0);
      
      const exito = await actualizarPedidoEnFirebase(form.id, {
        cliente: form.cliente,
        paquete: form.producto,
        cantPaquetes: form.cantidad,
        costoPaquete: form.precio,
        pagadoCompleto: nuevoSaldo <= 0
      });
      
      if (exito) {
        const pedidosActualizados = pedidos.map(p => 
          p.id === form.id 
            ? { 
                ...p, 
                cliente: form.cliente, 
                paquete: form.producto,
                cantPaquetes: form.cantidad,
                costoPaquete: form.precio,
                total: nuevoTotal,
                saldo: Math.max(0, nuevoSaldo),
                pagadoCompleto: nuevoSaldo <= 0
              }
            : p
        );
        setPedidos(pedidosActualizados);
        alert('Pedido actualizado correctamente');
      } else {
        alert('Error al actualizar el pedido');
      }
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Error al guardar los cambios');
    } finally {
      setGuardando(false);
      setModoEdicion(false);
      setMostrarFormulario(false);
      resetFormulario();
    }
  };

  // --- REGISTRAR PAGO DE PEDIDO ---
  const registrarPago = async (e) => {
    e.preventDefault();
    if (!form.cliente || !form.producto || form.precio <= 0) {
      alert('Complete todos los campos correctamente');
      return;
    }

    setGuardando(true);
    
    try {
      const montoPagado = form.cantidad * form.precio;
      
      const nuevaVenta = {
        clienteId: form.clienteId,
        cliente: form.cliente,
        producto: form.producto,
        cantidad: form.cantidad,
        precio: form.precio,
        total: montoPagado,
        pedidoId: form.pedidoId,
        fecha: new Date().toLocaleString(),
        fechaISO: new Date().toISOString(),
        registradoPor: usuario?.nombre || 'Sistema',
        registradoPorId: usuario?.id
      };
      
      await crear(COLLECTIONS.VENTAS, nuevaVenta);
      
      if (form.pedidoId) {
        const pedidoActual = pedidos.find(p => p.id === form.pedidoId);
        if (pedidoActual) {
          const nuevoSaldo = pedidoActual.saldo - montoPagado;
          const pagadoCompleto = nuevoSaldo <= 0;
          
          await actualizarPedidoEnFirebase(form.pedidoId, {
            anticipo: pedidoActual.anticipo + montoPagado,
            pagadoCompleto: pagadoCompleto
          });
          
          const pedidosActualizados = pedidos.map(p => 
            p.id === form.pedidoId 
              ? { ...p, saldo: Math.max(0, nuevoSaldo), pagadoCompleto: pagadoCompleto }
              : p
          );
          setPedidos(pedidosActualizados);
        }
      }
      
      resetFormulario();
      setMostrarFormulario(false);
      alert('Pago registrado correctamente');
    } catch (error) {
      console.error('Error al registrar pago:', error);
      alert('Error al registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  // --- ELIMINAR PEDIDO ---
  const eliminarPedido = async (pedidoId) => {
    if (!confirm('¿Estás seguro de eliminar este pedido? Esta acción no se puede deshacer.')) return;
    
    setGuardando(true);
    
    try {
      const exito = await eliminarPedidoDeFirebase(pedidoId);
      
      if (exito) {
        const pedidosActualizados = pedidos.filter(p => p.id !== pedidoId);
        setPedidos(pedidosActualizados);
        alert('Pedido eliminado correctamente');
      } else {
        alert('Error al eliminar el pedido');
      }
    } catch (error) {
      console.error('Error al eliminar:', error);
      alert('Error al eliminar el pedido');
    } finally {
      setGuardando(false);
    }
  };

  // --- ELIMINAR VENTA/TRANSACCIÓN ---
  const eliminarVenta = async (ventaId, pedidoId, monto) => {
    if (!confirm('¿Deseas anular este registro de venta? Esta acción no se puede deshacer.')) return;
    
    setGuardando(true);
    
    try {
      await eliminar(COLLECTIONS.VENTAS, ventaId);
      
      if (pedidoId) {
        const pedidoActual = pedidos.find(p => p.id === pedidoId);
        if (pedidoActual) {
          const nuevoSaldo = pedidoActual.saldo + monto;
          
          await actualizarPedidoEnFirebase(pedidoId, {
            anticipo: pedidoActual.anticipo - monto,
            pagadoCompleto: false
          });
          
          const pedidosActualizados = pedidos.map(p => 
            p.id === pedidoId 
              ? { ...p, saldo: nuevoSaldo, pagadoCompleto: false }
              : p
          );
          setPedidos(pedidosActualizados);
        }
      }
      
      alert('Venta anulada correctamente');
    } catch (error) {
      console.error('Error al eliminar venta:', error);
      alert('Error al anular la venta');
    } finally {
      setGuardando(false);
    }
  };

  // --- RESET FORMULARIO ---
  const resetFormulario = () => {
    setForm({ 
      id: '', 
      clienteId: '', 
      cliente: '', 
      producto: '', 
      cantidad: 1, 
      precio: 0, 
      pedidoId: '',
      institucion: '',
      grupo: '',
      paquete: '',
      total: 0
    });
    setModoEdicion(false);
    setPedidoEditando(null);
  };

  // --- SELECCIONAR CLIENTE DESDE PEDIDOS ---
  const handleSeleccionarPedido = (pedidoId) => {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (pedido) {
      // Validar que el pedido tenga saldo pendiente
      if (pedido.saldo <= 0) {
        alert('Este pedido ya está completamente pagado');
        return;
      }
      
      setForm({
        ...form,
        clienteId: pedido.clienteId,
        cliente: pedido.cliente,
        producto: `PAGO: ${pedido.paquete} (${pedido.institucion} - ${pedido.grupo})`,
        cantidad: 1,
        precio: pedido.saldo,
        pedidoId: pedido.id
      });
      setModoEdicion(false);
    }
  };

  // --- FILTRADO DE PEDIDOS MEMOIZADO ---
  const pedidosFiltrados = useMemo(() => {
    let resultados = [...pedidos];
    
    if (busqueda.trim()) {
      const busquedaLower = busqueda.toLowerCase();
      resultados = resultados.filter(p =>
        p.cliente?.toLowerCase().includes(busquedaLower) ||
        p.paquete?.toLowerCase().includes(busquedaLower) ||
        p.institucion?.toLowerCase().includes(busquedaLower)
      );
    }
    
    if (filtroEstado === 'pendientes') {
      resultados = resultados.filter(p => p.saldo > 0 && !p.pagadoCompleto);
    } else if (filtroEstado === 'pagados') {
      resultados = resultados.filter(p => p.pagadoCompleto);
    }
    
    return resultados;
  }, [pedidos, busqueda, filtroEstado]);

  // --- PAGINACIÓN ---
  const totalPaginas = Math.ceil(pedidosFiltrados.length / ITEMS_POR_PAGINA);
  const pedidosPaginados = useMemo(() => {
    const start = (paginaActual - 1) * ITEMS_POR_PAGINA;
    return pedidosFiltrados.slice(start, start + ITEMS_POR_PAGINA);
  }, [pedidosFiltrados, paginaActual]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroEstado]);

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
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-light">
      <div className="max-w-7xl mx-auto">
        
        {/* Indicadores de estado */}
        {(sincronizando || guardando) && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {guardando ? 'Guardando...' : 'Sincronizando...'}
          </div>
        )}
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-3">
          <div>
            <nav className="mb-2">
              <Link href="/" className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Volver al Dashboard
              </Link>
            </nav>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">💰 Caja & Cobros</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-[10px] sm:text-xs text-gray-400">
                Gestión de cobros vinculada a pedidos · {esAdmin ? 'Administrador' : 'Empleado'}
              </p>
              <span className="text-[10px] sm:text-xs text-green-600">Tiempo real</span>
            </div>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="flex-1 md:w-64">
              <input 
                type="text" 
                placeholder="Buscar por cliente, paquete o institución..." 
                className="w-full border border-gray-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            {esAdmin && (
              <button
                onClick={() => {
                  resetFormulario();
                  setMostrarFormulario(!mostrarFormulario);
                }}
                className="bg-gray-900 text-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm hover:bg-gray-800 transition-colors whitespace-nowrap"
              >
                {mostrarFormulario ? '✕ Cerrar' : '+ Nuevo Pedido'}
              </button>
            )}
          </div>
        </header>

        {/* FORMULARIO FLOTANTE */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-medium">
                  {modoEdicion ? '✏️ Editar Pedido' : '💰 Registrar Pago'}
                </h2>
                <button 
                  onClick={() => {
                    setMostrarFormulario(false);
                    resetFormulario();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={modoEdicion ? guardarEdicionPedido : registrarPago} className="space-y-3 sm:space-y-4">
                
                {!modoEdicion && (
                  <div>
                    <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">
                      Seleccionar pedido pendiente
                    </label>
                    <select 
                      className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none bg-white"
                      onChange={(e) => handleSeleccionarPedido(e.target.value)}
                      value={form.pedidoId}
                    >
                      <option value="">Seleccionar pedido...</option>
                      {pedidos.filter(p => p.saldo > 0 && !p.pagadoCompleto).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.cliente} - Saldo: ${p.saldo.toLocaleString()} ({p.institucion})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {modoEdicion && (
                  <div className="bg-gray-50 p-2 rounded text-[10px] text-gray-500">
                    <p>Institución: {form.institucion}</p>
                    <p>Grupo: {form.grupo}</p>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-gray-400">
                      {modoEdicion ? 'Editar información' : 'O registrar manualmente'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">Cliente *</label>
                  <input 
                    type="text" required
                    className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                    value={form.cliente}
                    onChange={(e) => setForm({...form, cliente: e.target.value, pedidoId: ''})}
                    placeholder="Ej: Juan Pérez"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">Concepto *</label>
                  <input 
                    type="text" required
                    className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                    value={form.producto}
                    onChange={(e) => setForm({...form, producto: e.target.value})}
                    placeholder={modoEdicion ? "Ej: Paquete Básico" : "Ej: Pago de paquete"}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">Cantidad</label>
                    <input 
                      type="number" required min="1"
                      className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                      value={form.cantidad}
                      onChange={(e) => setForm({...form, cantidad: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">Monto</label>
                    <input 
                      type="number" required min="0"
                      className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                      value={form.precio}
                      onChange={(e) => setForm({...form, precio: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-2 sm:p-3 -mx-3 sm:-mx-4">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span className="text-gray-500">Total:</span>
                    <span className="font-medium text-gray-900">${(form.cantidad * form.precio).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit"
                    disabled={guardando}
                    className="flex-1 bg-gray-900 text-white text-xs sm:text-sm py-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {guardando ? 'Procesando...' : (modoEdicion ? 'Guardar Cambios' : 'Registrar Pago')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setMostrarFormulario(false);
                      resetFormulario();
                    }}
                    className="flex-1 border border-gray-200 text-xs sm:text-sm py-2 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* GRÁFICA DE VENTAS POR TEMPORADA */}
        <section className="border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6 bg-white">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">
              📈 Ingresos por Temporada
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
          
          <div className="h-40 sm:h-48 flex items-end gap-1">
            {datosGrafica.values.map((valor, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-green-500 hover:bg-green-600 transition-all duration-300 rounded-t"
                  style={{ height: `${(valor / maxValor) * 100}%`, minHeight: '4px' }}
                >
                  <div className="opacity-0 hover:opacity-100 transition-opacity text-center -mt-5 text-[8px] sm:text-[10px] font-medium text-green-600">
                    ${valor.toLocaleString()}
                  </div>
                </div>
                <span className="text-[6px] sm:text-[8px] text-gray-400 mt-1 truncate w-full text-center">
                  {datosGrafica.labels[i]}
                </span>
              </div>
            ))}
          </div>
          
          <div className="mt-3 pt-2 border-t border-gray-100 text-[8px] sm:text-[10px] text-gray-400 text-center">
            Total pagado período: ${datosGrafica.values.reduce((a, b) => a + b, 0).toLocaleString()}
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2 mb-4 sm:mb-6">
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📅 Pagos Hoy</p>
            <p className="text-xs sm:text-base font-light truncate">${estadisticas.totalHoy.toLocaleString()}</p>
            <p className="text-[8px] sm:text-[10px] text-gray-400 mt-1">{estadisticas.transaccionesHoy} pagos</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📆 Esta semana</p>
            <p className="text-xs sm:text-base font-light truncate">${estadisticas.totalSemana.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📆 Este mes</p>
            <p className="text-xs sm:text-base font-light truncate">${estadisticas.totalMes.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3">
            <p className="text-[8px] sm:text-[10px] text-gray-400">📆 Este año</p>
            <p className="text-xs sm:text-base font-light truncate">${estadisticas.totalAnio.toLocaleString()}</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 bg-amber-50">
            <p className="text-[8px] sm:text-[10px] text-amber-600">⏳ Por cobrar</p>
            <p className="text-xs sm:text-base font-light text-amber-700">${estadisticas.totalPorCobrar.toLocaleString()}</p>
            <p className="text-[8px] sm:text-[10px] text-amber-500">{estadisticas.pendientesCobro} pedidos</p>
          </div>
          <div className="border border-gray-200 p-2 sm:p-3 bg-green-50">
            <p className="text-[8px] sm:text-[10px] text-green-600">✅ Total pagado</p>
            <p className="text-xs sm:text-base font-light text-green-700">${estadisticas.totalPagado.toLocaleString()}</p>
          </div>
          <div className="border border-gray-900 p-2 sm:p-3 bg-gray-900 text-white">
            <p className="text-[8px] sm:text-[10px] text-gray-400">💰 Total facturado</p>
            <p className="text-xs sm:text-base font-light truncate">${pedidos.reduce((sum, p) => sum + p.total, 0).toLocaleString()}</p>
          </div>
        </section>

        {/* TABLA DE PEDIDOS */}
        <div className="border border-gray-200 p-3 sm:p-4 bg-white">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 gap-2 sm:gap-0">
            <h2 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500">
              📋 Historial de Pedidos ({pedidosFiltrados.length} registros)
            </h2>
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => setFiltroEstado('todos')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${filtroEstado === 'todos' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroEstado('pendientes')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${filtroEstado === 'pendientes' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setFiltroEstado('pagados')}
                className={`text-[8px] sm:text-[10px] px-2 py-1 border ${filtroEstado === 'pagados' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Pagados
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 text-[9px] sm:text-xs text-gray-500">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Institución / Grupo</th>
                  <th className="pb-2 font-medium">Paquete</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Pagado</th>
                  <th className="pb-2 text-right font-medium">Saldo</th>
                  <th className="pb-2 text-center font-medium">Estado</th>
                  {esAdmin && <th className="pb-2 text-center font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedidosPaginados.length === 0 ? (
                  <tr>
                    <td colSpan={esAdmin ? 9 : 8} className="py-8 sm:py-12 text-center text-xs text-gray-400">
                      No hay pedidos registrados
                    </td>
                  </tr>
                ) : (
                  pedidosPaginados.map((p) => (
                    <tr key={p.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-2 sm:py-3 text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">
                        {p.fechaRegistro}
                      </td>
                      <td className="py-2 sm:py-3">
                        <p className="text-xs sm:text-sm font-medium break-words">{p.cliente}</p>
                      </td>
                      <td className="py-2 sm:py-3">
                        <div>
                          <p className="text-xs break-words">{p.institucion}</p>
                          <p className="text-[8px] sm:text-[10px] text-gray-400">{p.grupo}</p>
                        </div>
                      </td>
                      <td className="py-2 sm:py-3">
                        <p className="text-xs break-words">{p.paquete}</p>
                      </td>
                      <td className="py-2 sm:py-3 text-right">
                        <span className="text-xs font-medium">${p.total.toLocaleString()}</span>
                      </td>
                      <td className="py-2 sm:py-3 text-right">
                        <span className="text-xs text-green-600">${(p.total - p.saldo).toLocaleString()}</span>
                      </td>
                      <td className="py-2 sm:py-3 text-right">
                        <span className={`text-xs font-medium ${p.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${p.saldo.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2 sm:py-3 text-center">
                        {p.pagadoCompleto ? (
                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded">Pagado</span>
                        ) : p.saldo > 0 ? (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded">Pendiente</span>
                        ) : (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">Parcial</span>
                        )}
                      </td>
                      {esAdmin && (
                        <td className="py-2 sm:py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => abrirEditarPedido(p)}
                              className="text-blue-500 hover:text-blue-700 transition-colors"
                              title="Editar pedido"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => eliminarPedido(p.id)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="Eliminar pedido"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-gray-200">
                <tr className="bg-gray-50">
                  <td colSpan="4" className="pt-3 text-right text-[10px] sm:text-xs font-medium text-gray-500">
                    Total:
                  </td>
                  <td className="pt-3 text-right text-xs sm:text-sm font-bold text-gray-900">
                    ${pedidosFiltrados.reduce((sum, p) => sum + p.total, 0).toLocaleString()}
                  </td>
                  <td className="pt-3 text-right text-xs sm:text-sm font-bold text-green-600">
                    ${pedidosFiltrados.reduce((sum, p) => sum + (p.total - p.saldo), 0).toLocaleString()}
                  </td>
                  <td className="pt-3 text-right text-xs sm:text-sm font-bold text-red-600">
                    ${pedidosFiltrados.reduce((sum, p) => sum + p.saldo, 0).toLocaleString()}
                  </td>
                  {esAdmin && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1 text-xs border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-400 transition-colors"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-xs text-gray-600">
                Página {paginaActual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                disabled={paginaActual === totalPaginas}
                className="px-3 py-1 text-xs border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-400 transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>

        {/* ACCESOS RÁPIDOS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 sm:gap-2 mt-4 sm:mt-6">
          <Link href="/pedidos" className="bg-gray-900 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            📋 Planilla de Control
          </Link>
          <Link href="/administracion" className="bg-purple-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            ⚙️ Control Operaciones
          </Link>
          <Link href="/acreditacion" className="bg-amber-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            🎫 QR Check
          </Link>
          <Link href="/agenda" className="bg-emerald-600 text-white px-2 py-1.5 sm:py-2 text-center hover:opacity-90 transition-opacity text-[10px] sm:text-xs">
            📅 Agenda
          </Link>
        </div>
      </div>
    </main>
  );
}
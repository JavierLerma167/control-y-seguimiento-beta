// app/administracion/page.js (VERSIÓN CORREGIDA CON BOTÓN DE CERRAR SESIÓN)
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import { useTasks } from '../hooks/useTasks';

export default function AdministracionPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    actualizar, 
    suscribir, 
    crearNotificacion,
    registrarProductividad,
    cerrarSesion,
    COLLECTIONS 
  } = useFirebase();
  const tasks = useTasks();

  // --- ESTADOS ---
  const [asistentes, setAsistentes] = useState([]);
  const [planillaFull, setPlanillaFull] = useState({ 
    instituciones: [],
    grupos: [],
    metadatos: {} 
  });
  const [pedidosGlobales, setPedidosGlobales] = useState([]);
  const [nuevoAsistente, setNuevoAsistente] = useState('');
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [vistaGrafica, setVistaGrafica] = useState('etapas');
  const [productividadDiaria, setProductividadDiaria] = useState({});
  const [productividadSemanal, setProductividadSemanal] = useState({});
  
  // Notas por grupo
  const [notasGrupo, setNotasGrupo] = useState({});
  const [editandoNota, setEditandoNota] = useState(null);
  const [notaTemporal, setNotaTemporal] = useState('');
  
  const [seleccionMasiva, setSeleccionMasiva] = useState({ 
    institucionId: '',
    grupoId: '', 
    proceso: 'toma', 
    responsable: '' 
  });

  const [modalTarea, setModalTarea] = useState(false);
  const [modalEditarTarea, setModalEditarTarea] = useState(false);
  const [tareaEditando, setTareaEditando] = useState(null);
  const [formTarea, setFormTarea] = useState({
    titulo: '',
    descripcion: '',
    asignadoA: '',
    prioridad: 'media',
    fechaLimite: ''
  });
  const [filtroEmpleado, setFiltroEmpleado] = useState('todos');
  const [fechaLimiteProductividad, setFechaLimiteProductividad] = useState(() => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 7);
    return fecha.toISOString().split('T')[0];
  });

  const esAdmin = usuario?.rol === 'admin';
  const savingRef = useRef(false);
  const savingTimeoutRef = useRef(null);
  const isMounted = useRef(true);

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

  // --- CARGAR STAFF DESDE FIREBASE ---
  useEffect(() => {
    if (!usuario) return;
    
    const cargarStaff = async () => {
      const staffData = await leerTodos(COLLECTIONS.USUARIOS);
      if (staffData && isMounted.current) {
        const empleados = staffData.filter(u => u.rol === 'empleado' && u.activo !== false);
        setAsistentes(empleados);
      }
    };
    cargarStaff();
  }, [usuario, leerTodos]);

  // --- CARGAR NOTAS DESDE LOCALSTORAGE ---
  useEffect(() => {
    const notasGuardadas = localStorage.getItem('notas_operaciones');
    if (notasGuardadas) {
      try {
        setNotasGrupo(JSON.parse(notasGuardadas));
      } catch (e) {
        console.error('Error cargando notas:', e);
      }
    }
  }, []);

  const guardarNotas = useCallback((nuevasNotas) => {
    setNotasGrupo(nuevasNotas);
    localStorage.setItem('notas_operaciones', JSON.stringify(nuevasNotas));
  }, []);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A PLANILLA ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.PEDIDOS, (data) => {
      if (data && data.length > 0 && isMounted.current) {
        const pedidosData = data[0];
        if (pedidosData && pedidosData.instituciones) {
          setPlanillaFull(pedidosData);
          actualizarVistaPedidos(pedidosData);
          calcularProductividadDiaria(pedidosData);
          calcularProductividadSemanal(pedidosData);
        }
      }
      setCargado(true);
      setSincronizando(false);
    }, (error) => {
      console.error('Error en suscripción:', error);
      setSincronizando(false);
    });
    
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [usuario, suscribir]);

  const actualizarVistaPedidos = useCallback((data) => {
    if (!data?.instituciones) return;
    
    const todos = data.instituciones.flatMap(inst => 
      inst.grupos?.flatMap(g => 
        g.registros?.map(r => ({ 
          ...r, 
          institucionNombre: inst.nombre,
          institucionId: inst.id,
          grupoNombre: g.nombre, 
          grupoId: g.id,
          grupoNotas: g.notas || '',
          grupoFechas: g.fechas || []
        })) || []
      ) || []
    );
    setPedidosGlobales(todos);
  }, []);

  // Calcular productividad diaria por empleado
  const calcularProductividadDiaria = useCallback((data) => {
    if (!data?.instituciones) return;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyISO = hoy.toISOString().split('T')[0];
    
    const productividad = {};
    
    data.instituciones.forEach(inst => {
      inst.grupos?.forEach(grupo => {
        grupo.registros?.forEach(registro => {
          const pasos = ['toma', 'edicion', 'impreso', 'empaquetado', 'entregado'];
          pasos.forEach(paso => {
            if (registro[paso] && registro[`fecha_${paso}`]) {
              const fechaPaso = new Date(registro[`fecha_${paso}`]);
              const esHoy = fechaPaso.toDateString() === hoy.toDateString() ||
                            fechaPaso.toISOString().split('T')[0] === hoyISO;
              
              if (esHoy && registro[`resp_${paso}`]) {
                const empleado = registro[`resp_${paso}`];
                if (!productividad[empleado]) {
                  productividad[empleado] = {
                    toma: 0, edicion: 0, impreso: 0, empaquetado: 0, entregado: 0,
                    total: 0
                  };
                }
                productividad[empleado][paso === 'impreso' ? 'impreso' : paso]++;
                productividad[empleado].total++;
              }
            }
          });
        });
      });
    });
    
    setProductividadDiaria(productividad);
  }, []);

  // Calcular productividad semanal
  const calcularProductividadSemanal = useCallback((data) => {
    if (!data?.instituciones) return;
    
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - 7);
    
    const productividad = {};
    
    data.instituciones.forEach(inst => {
      inst.grupos?.forEach(grupo => {
        grupo.registros?.forEach(registro => {
          const pasos = ['toma', 'edicion', 'impreso', 'empaquetado', 'entregado'];
          pasos.forEach(paso => {
            if (registro[paso] && registro[`fecha_${paso}`]) {
              const fechaPaso = new Date(registro[`fecha_${paso}`]);
              const enSemana = fechaPaso >= inicioSemana;
              
              if (enSemana && registro[`resp_${paso}`]) {
                const empleado = registro[`resp_${paso}`];
                if (!productividad[empleado]) {
                  productividad[empleado] = {
                    toma: 0, edicion: 0, impreso: 0, empaquetado: 0, entregado: 0,
                    total: 0
                  };
                }
                productividad[empleado][paso === 'impreso' ? 'impreso' : paso]++;
                productividad[empleado].total++;
              }
            }
          });
        });
      });
    });
    
    setProductividadSemanal(productividad);
  }, []);

  // --- GUARDAR EN FIREBASE ---
  const guardarEnFirebase = useCallback(async (nuevaPlanilla) => {
    if (!usuario) return;
    if (savingRef.current) return;
    
    savingRef.current = true;
    
    if (savingTimeoutRef.current) {
      clearTimeout(savingTimeoutRef.current);
    }
    
    try {
      const existingDocs = await leerTodos(COLLECTIONS.PEDIDOS);
      if (existingDocs && existingDocs.length > 0) {
        await actualizar(COLLECTIONS.PEDIDOS, existingDocs[0].id, nuevaPlanilla);
      }
    } catch (error) {
      console.error('Error guardando en Firebase:', error);
    } finally {
      savingTimeoutRef.current = setTimeout(() => {
        savingRef.current = false;
        savingTimeoutRef.current = null;
      }, 500);
    }
  }, [usuario, leerTodos, actualizar]);

  const guardarNotaGrupo = useCallback(async (grupoId, nota) => {
    if (!planillaFull.instituciones) return;
    
    const nuevasInstituciones = planillaFull.instituciones.map(inst => ({
      ...inst,
      grupos: inst.grupos?.map(g => 
        g.id === grupoId ? { ...g, notas: nota } : g
      )
    }));
    
    const nuevaPlanilla = { ...planillaFull, instituciones: nuevasInstituciones };
    setPlanillaFull(nuevaPlanilla);
    await guardarEnFirebase(nuevaPlanilla);
    actualizarVistaPedidos(nuevaPlanilla);
  }, [planillaFull, guardarEnFirebase, actualizarVistaPedidos]);

  const agregarAsistente = async (e) => {
    e.preventDefault();
    if (!nuevoAsistente.trim()) return;
    if (!esAdmin) return;
    
    const nuevoStaff = { 
      id: Date.now().toString(), 
      nombre: nuevoAsistente.toUpperCase(),
      email: `${nuevoAsistente.toLowerCase().replace(/\s/g, '')}@evr.com`,
      rol: 'empleado',
      activo: true,
      fechaRegistro: new Date().toLocaleDateString(),
      fechaRegistroISO: new Date().toISOString()
    };
    
    const nuevosAsistentes = [...asistentes, nuevoStaff];
    setAsistentes(nuevosAsistentes);
    setNuevoAsistente('');
    
    await crearNotificacion({
      usuarioId: nuevoStaff.id,
      tipo: 'bienvenida',
      titulo: 'Bienvenido al equipo',
      mensaje: `Has sido agregado como empleado. Tu código de acceso es: ${nuevoStaff.email.split('@')[0]}`,
      prioridad: 'alta'
    });
  };

  const eliminarAsistente = async (id) => {
    if (!esAdmin) return;
    if (confirm("¿Eliminar este miembro del staff?")) {
      const nuevosAsistentes = asistentes.filter(i => i.id !== id);
      setAsistentes(nuevosAsistentes);
    }
  };

  // --- FUNCIONES DE TAREAS ---
  const handleCrearTarea = useCallback((e) => {
    e.preventDefault();
    
    if (!formTarea.asignadoA) {
      alert('Selecciona un empleado');
      return;
    }

    const tareaCreada = tasks.crearTarea(formTarea);
    
    if (tareaCreada) {
      setModalTarea(false);
      resetFormTarea();
    }
  }, [tasks, formTarea]);

  const abrirEditarTarea = (tarea) => {
    if (!esAdmin && tarea.asignadoA !== usuario?.id) {
      alert('No tienes permiso para editar esta tarea');
      return;
    }
    setTareaEditando(tarea);
    setFormTarea({
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || '',
      asignadoA: tarea.asignadoA,
      prioridad: tarea.prioridad || 'media',
      fechaLimite: tarea.fechaLimite || ''
    });
    setModalEditarTarea(true);
  };

  const guardarEdicionTarea = useCallback(async (e) => {
    e.preventDefault();
    
    if (!formTarea.asignadoA) {
      alert('Selecciona un empleado');
      return;
    }

    const datosActualizados = {
      titulo: formTarea.titulo,
      descripcion: formTarea.descripcion,
      asignadoA: formTarea.asignadoA,
      prioridad: formTarea.prioridad,
      fechaLimite: formTarea.fechaLimite
    };

    const exito = await tasks.editarTarea(tareaEditando.id, datosActualizados);
    
    if (exito) {
      setModalEditarTarea(false);
      resetFormTarea();
      setTareaEditando(null);
    }
  }, [tasks, formTarea, tareaEditando]);

  const eliminarTarea = useCallback(async (tareaId) => {
    if (!esAdmin) {
      alert('Solo los administradores pueden eliminar tareas');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar esta tarea? Esta acción no se puede deshacer.')) return;
    
    const exito = await tasks.eliminarTarea(tareaId);
    if (exito) {
      alert('Tarea eliminada correctamente');
    } else {
      alert('Error al eliminar la tarea');
    }
  }, [tasks, esAdmin]);

  const resetFormTarea = () => {
    setFormTarea({
      titulo: '',
      descripcion: '',
      asignadoA: '',
      prioridad: 'media',
      fechaLimite: ''
    });
  };

  const getEmpleadoNombre = useCallback((id) => {
    const empleado = asistentes.find(e => e.id === id);
    return empleado ? empleado.nombre : 'Desconocido';
  }, [asistentes]);

  const getColorPrioridad = (prioridad) => {
    switch(prioridad) {
      case 'alta': return 'bg-red-100 text-red-700';
      case 'media': return 'bg-amber-100 text-amber-700';
      case 'baja': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // --- LÓGICA DE ACTUALIZACIÓN DE ESTADOS ---
  const toggleStatusIndividual = useCallback((grupoId, registroId, campo) => {
    if (!esAdmin && !planillaFull.instituciones) return;
    
    const nuevasInstituciones = planillaFull.instituciones.map(inst => ({
      ...inst,
      grupos: inst.grupos?.map(g => {
        if (g.id === grupoId) {
          return {
            ...g,
            registros: g.registros?.map(r => {
              if (r.id === registroId) {
                const nuevoEstado = !r[campo];
                const responsableAsignado = nuevoEstado ? usuario?.nombre : "";
                
                if (nuevoEstado && campo === 'entregado') {
                  crearNotificacion({
                    usuarioId: r.resp_toma || r.clienteId,
                    tipo: 'pedido_completado',
                    titulo: 'Pedido completado',
                    mensaje: `El pedido de ${r.cliente} ha sido entregado.`,
                    prioridad: 'media'
                  });
                }
                
                return { 
                  ...r, 
                  [campo]: nuevoEstado,
                  [`resp_${campo}`]: nuevoEstado ? responsableAsignado : "",
                  [`fecha_${campo}`]: nuevoEstado ? new Date().toISOString() : null
                };
              }
              return r;
            })
          };
        }
        return g;
      })
    }));
    
    const nuevaPlanilla = { ...planillaFull, instituciones: nuevasInstituciones };
    setPlanillaFull(nuevaPlanilla);
    guardarEnFirebase(nuevaPlanilla);
    actualizarVistaPedidos(nuevaPlanilla);
    
    // Registrar productividad del empleado
    if (campo && usuario?.nombre) {
      registrarProductividad(usuario.id, registroId, campo, 15);
    }
  }, [planillaFull, usuario, guardarEnFirebase, actualizarVistaPedidos, crearNotificacion, esAdmin, registrarProductividad]);

  const aplicarResponsableMasivo = useCallback(() => {
    if (!esAdmin) return;
    const { institucionId, grupoId, proceso, responsable } = seleccionMasiva;
    if (!grupoId || !responsable) return alert("Selecciona un grupo y un responsable");
    if (!planillaFull.instituciones) return;
    
    const nuevasInstituciones = planillaFull.instituciones.map(inst => {
      if (institucionId && inst.id !== institucionId) return inst;
      
      return {
        ...inst,
        grupos: inst.grupos?.map(g => {
          if (g.id === grupoId) {
            return {
              ...g,
              registros: g.registros?.map(r => ({
                ...r,
                [proceso]: true,
                [`resp_${proceso}`]: responsable,
                [`fecha_${proceso}`]: new Date().toISOString()
              }))
            };
          }
          return g;
        })
      };
    });
    
    const nuevaPlanilla = { ...planillaFull, instituciones: nuevasInstituciones };
    setPlanillaFull(nuevaPlanilla);
    guardarEnFirebase(nuevaPlanilla);
    actualizarVistaPedidos(nuevaPlanilla);
  }, [planillaFull, seleccionMasiva, guardarEnFirebase, actualizarVistaPedidos, esAdmin]);

  const eliminarResponsablesGrupo = useCallback(() => {
    if (!esAdmin) return;
    if(!seleccionMasiva.grupoId) return;
    if(!confirm("¿Limpiar todos los responsables de este grupo?")) return;
    if (!planillaFull.instituciones) return;
    
    const nuevasInstituciones = planillaFull.instituciones.map(inst => ({
      ...inst,
      grupos: inst.grupos?.map(g => {
        if (g.id === seleccionMasiva.grupoId) {
          return {
            ...g,
            registros: g.registros?.map(r => {
              const temp = { ...r };
              ['toma', 'edicion', 'impreso', 'empaquetado', 'entregado'].forEach(p => {
                temp[p] = false;
                temp[`resp_${p}`] = "";
                temp[`fecha_${p}`] = null;
              });
              return temp;
            })
          };
        }
        return g;
      })
    }));
    
    const nuevaPlanilla = { ...planillaFull, instituciones: nuevasInstituciones };
    setPlanillaFull(nuevaPlanilla);
    guardarEnFirebase(nuevaPlanilla);
    actualizarVistaPedidos(nuevaPlanilla);
  }, [planillaFull, seleccionMasiva.grupoId, guardarEnFirebase, actualizarVistaPedidos, esAdmin]);

  const totalItems = pedidosGlobales.length;
  const conteoToma = pedidosGlobales.filter(p => p.toma).length;
  const conteoEdicion = pedidosGlobales.filter(p => p.edicion).length;
  const conteoImpresion = pedidosGlobales.filter(p => p.impreso).length;
  const conteoEmpaque = pedidosGlobales.filter(p => p.empaquetado).length;
  const conteoEntrega = pedidosGlobales.filter(p => p.entregado).length;
  
  // Eficiencia de empleados con productividad
  const eficienciaEmpleados = asistentes.map(emp => {
    const tareasAsignadas = tasks?.tareas?.filter(t => t.asignadoA === emp.id) || [];
    const tareasCompletadas = tareasAsignadas.filter(t => t.estado === 'completada');
    const pedidosCompletados = pedidosGlobales.filter(p => 
      p.resp_toma === emp.nombre || 
      p.resp_edicion === emp.nombre || 
      p.resp_impreso === emp.nombre || 
      p.resp_empaquetado === emp.nombre
    ).length;
    
    const productividadHoy = productividadDiaria[emp.nombre] || { total: 0 };
    const productividadSemana = productividadSemanal[emp.nombre] || { total: 0 };
    
    return {
      ...emp,
      tareasTotal: tareasAsignadas.length,
      tareasCompletadas: tareasCompletadas.length,
      eficienciaTareas: tareasAsignadas.length > 0 
        ? Math.round((tareasCompletadas.length / tareasAsignadas.length) * 100) 
        : 0,
      pedidosCompletados,
      productividadHoy: productividadHoy.total,
      productividadSemana: productividadSemana.total,
      productividadDetalle: productividadHoy,
      productividadDetalleSemana: productividadSemana
    };
  }).filter(emp => filtroEmpleado === 'todos' || emp.id === filtroEmpleado);

  const obtenerGrupos = useCallback(() => {
    if (planillaFull.instituciones) {
      return planillaFull.instituciones.flatMap(inst => 
        inst.grupos?.map(g => ({
          ...g,
          nombreCompleto: `${inst.nombre} - ${g.nombre}`,
          institucionId: inst.id
        })) || []
      );
    }
    return [];
  }, [planillaFull]);

  const gruposDisponibles = obtenerGrupos();

  // Protección de ruta
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current);
      }
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
              <p className="mt-4 text-sm text-gray-400">Cargando administración...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-12 font-light">
      <div className="max-w-7xl mx-auto">
        
        {sincronizando && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            🔄 Sincronizando...
          </div>
        )}
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-10 gap-3 sm:gap-0">
          <div className="w-full md:w-auto">
            <nav className="mb-2 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                  ← Volver al Dashboard
                </Link>
                {tasks?.tareasPendientes > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full animate-pulse">
                    {tasks.tareasPendientes} tarea(s) pendiente(s)
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-900 transition-colors border border-gray-200 px-3 py-1 rounded"
              >
                🚪 Cerrar sesión
              </button>
            </nav>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">⚙️ Control de Administración</h1>
            <p className="text-xs text-gray-400 mt-1">
              Gestión de tareas · Productividad por empleado · {esAdmin ? '👑 Administrador' : '👤 Empleado'}
            </p>
          </div>
          <div className="mt-2 md:mt-0 text-right w-full md:w-auto">
            <p className="text-xs text-gray-400 mb-1">Avance Global</p>
            <p className="text-2xl sm:text-3xl font-light">
              {totalItems > 0 ? Math.round((conteoEntrega / totalItems) * 100) : 0}%
            </p>
          </div>
        </header>

        {/* FILTRO DE EMPLEADO */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👥 Filtrar por empleado:</span>
            <select 
              value={filtroEmpleado}
              onChange={(e) => setFiltroEmpleado(e.target.value)}
              className="border border-gray-200 px-3 py-1.5 text-xs rounded focus:border-gray-400 outline-none bg-white"
            >
              <option value="todos">Todos los empleados</option>
              {asistentes.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">📅 Mostrar desde:</span>
            <input 
              type="date" 
              value={fechaLimiteProductividad}
              onChange={(e) => setFechaLimiteProductividad(e.target.value)}
              className="border border-gray-200 px-3 py-1.5 text-xs rounded focus:border-gray-400 outline-none bg-white"
            />
          </div>
        </div>

        {/* PANEL DE PRODUCTIVIDAD POR EMPLEADO */}
        <section className="mb-8 sm:mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-medium text-gray-700">📊 Panel de Producción</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setVistaGrafica('etapas')}
                className={`text-[10px] sm:text-xs px-3 py-1 border ${vistaGrafica === 'etapas' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Por Etapas
              </button>
              <button
                onClick={() => setVistaGrafica('empleados')}
                className={`text-[10px] sm:text-xs px-3 py-1 border ${vistaGrafica === 'empleados' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}
              >
                Por Empleados
              </button>
            </div>
          </div>

          {vistaGrafica === 'etapas' ? (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">📸 Toma</span>
                  <span className="text-sm font-light">{conteoToma}/{totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${totalItems > 0 ? (conteoToma / totalItems) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{totalItems > 0 ? Math.round((conteoToma / totalItems) * 100) : 0}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">🎨 Edición</span>
                  <span className="text-sm font-light">{conteoEdicion}/{totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${totalItems > 0 ? (conteoEdicion / totalItems) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{totalItems > 0 ? Math.round((conteoEdicion / totalItems) * 100) : 0}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">🖨️ Impresión</span>
                  <span className="text-sm font-light">{conteoImpresion}/{totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${totalItems > 0 ? (conteoImpresion / totalItems) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{totalItems > 0 ? Math.round((conteoImpresion / totalItems) * 100) : 0}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">📦 Empaque</span>
                  <span className="text-sm font-light">{conteoEmpaque}/{totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${totalItems > 0 ? (conteoEmpaque / totalItems) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{totalItems > 0 ? Math.round((conteoEmpaque / totalItems) * 100) : 0}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-green-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">✅ Entregado</span>
                  <span className="text-sm font-light text-green-600">{conteoEntrega}/{totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-600 rounded-full transition-all duration-500" style={{ width: `${totalItems > 0 ? (conteoEntrega / totalItems) * 100 : 0}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{totalItems > 0 ? Math.round((conteoEntrega / totalItems) * 100) : 0}% entregado</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {eficienciaEmpleados.map(emp => (
                <div key={emp.id} className="border border-gray-200 p-3 bg-white">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium">{emp.nombre}</p>
                      <p className="text-[10px] text-gray-400">{emp.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-light">{emp.eficienciaTareas}%</p>
                      <p className="text-[8px] text-gray-400">eficiencia</p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${emp.eficienciaTareas}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>📋 {emp.tareasCompletadas}/{emp.tareasTotal} tareas</span>
                    <span>📦 {emp.pedidosCompletados} pedidos</span>
                  </div>
                  {/* Productividad diaria */}
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[8px] text-gray-400 mb-1">📅 Productividad hoy:</p>
                    <div className="flex gap-1 text-[8px]">
                      <span className={`${emp.productividadDetalle?.toma > 0 ? 'text-blue-600' : 'text-gray-300'}`}>📸 {emp.productividadDetalle?.toma || 0}</span>
                      <span className={`${emp.productividadDetalle?.edicion > 0 ? 'text-green-600' : 'text-gray-300'}`}>🎨 {emp.productividadDetalle?.edicion || 0}</span>
                      <span className={`${emp.productividadDetalle?.impreso > 0 ? 'text-orange-600' : 'text-gray-300'}`}>🖨️ {emp.productividadDetalle?.impreso || 0}</span>
                      <span className={`${emp.productividadDetalle?.empaquetado > 0 ? 'text-purple-600' : 'text-gray-300'}`}>📦 {emp.productividadDetalle?.empaquetado || 0}</span>
                      <span className={`${emp.productividadDetalle?.entregado > 0 ? 'text-green-600' : 'text-gray-300'}`}>✅ {emp.productividadDetalle?.entregado || 0}</span>
                    </div>
                    <p className="text-[8px] font-medium mt-1">Total hoy: {emp.productividadHoy} tareas</p>
                  </div>
                  {/* Productividad semanal */}
                  <div className="mt-1 pt-1 text-[8px] text-gray-400">
                    📊 Total esta semana: {emp.productividadSemana} tareas
                  </div>
                </div>
              ))}
              {eficienciaEmpleados.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No hay empleados registrados</p>
              )}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
          
          <div className="space-y-4 sm:space-y-6">
            
            {/* SECCIÓN DE TAREAS */}
            <section className="border border-gray-200 p-4 sm:p-6 bg-white">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-medium">📋 Tareas Asignadas</h2>
                {esAdmin && (
                  <button
                    onClick={() => setModalTarea(true)}
                    className="bg-gray-900 text-white px-3 py-1 text-xs hover:bg-gray-800"
                  >
                    + Asignar Tarea
                  </button>
                )}
              </div>
              
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {tasks?.tareas?.filter(t => !esAdmin ? t.asignadoA === usuario?.id : true).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No hay tareas asignadas</p>
                ) : (
                  tasks?.tareas?.filter(t => !esAdmin ? t.asignadoA === usuario?.id : true).map(tarea => (
                    <div key={tarea.id} className={`border p-3 ${tarea.estado === 'completada' ? 'bg-gray-50' : 'bg-white'} group`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xs font-medium flex-1">{tarea.titulo}</h3>
                        <div className="flex gap-1">
                          <span className={`text-[8px] px-2 py-1 rounded ${getColorPrioridad(tarea.prioridad)}`}>
                            {tarea.prioridad}
                          </span>
                          {(esAdmin || tarea.asignadoA === usuario?.id) && tarea.estado !== 'completada' && (
                            <>
                              <button
                                onClick={() => abrirEditarTarea(tarea)}
                                className="text-gray-400 hover:text-blue-500 transition-colors"
                                title="Editar tarea"
                              >
                                ✏️
                              </button>
                              {esAdmin && (
                                <button
                                  onClick={() => eliminarTarea(tarea.id)}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  title="Eliminar tarea"
                                >
                                  🗑️
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-2">{tarea.descripcion}</p>
                      <div className="flex justify-between items-center text-[8px] text-gray-400">
                        <span>Asignado a: {getEmpleadoNombre(tarea.asignadoA)}</span>
                        {tarea.asignadoA === usuario?.id && tarea.estado === 'pendiente' && (
                          <button
                            onClick={() => tasks.actualizarEstadoTarea(tarea.id, 'completada')}
                            className="bg-green-600 text-white px-2 py-0.5 rounded text-[8px] hover:bg-green-700"
                          >
                            ✓ Completar
                          </button>
                        )}
                        {tarea.estado === 'completada' && (
                          <span className="text-green-600">✓ Completada</span>
                        )}
                      </div>
                      {tarea.fechaLimite && (
                        <div className="mt-1 text-[8px] text-gray-400">
                          Límite: {new Date(tarea.fechaLimite).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* ASIGNACIÓN MASIVA */}
            {esAdmin && (
              <section className="border border-gray-200 p-4 sm:p-6 bg-white">
                <h2 className="text-sm font-medium mb-3 sm:mb-4">🎯 Asignación Masiva</h2>
                <div className="space-y-3 sm:space-y-4">
                  {planillaFull.instituciones && planillaFull.instituciones.length > 1 && (
                    <select 
                      className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                      value={seleccionMasiva.institucionId} 
                      onChange={(e) => {
                        setSeleccionMasiva({
                          ...seleccionMasiva, 
                          institucionId: e.target.value,
                          grupoId: ''
                        });
                      }}
                    >
                      <option value="">Todas las instituciones</option>
                      {planillaFull.instituciones.map(inst => (
                        <option key={inst.id} value={inst.id}>{inst.nombre}</option>
                      ))}
                    </select>
                  )}
                  
                  <select 
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={seleccionMasiva.grupoId} 
                    onChange={(e) => setSeleccionMasiva({...seleccionMasiva, grupoId: e.target.value})}
                  >
                    <option value="">Seleccionar grupo...</option>
                    {gruposDisponibles
                      .filter(g => !seleccionMasiva.institucionId || g.institucionId === seleccionMasiva.institucionId)
                      .map(g => (
                        <option key={g.id} value={g.id}>
                          {g.nombreCompleto || g.nombre}
                        </option>
                    ))}
                  </select>
                  
                  <select 
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={seleccionMasiva.proceso} 
                    onChange={(e) => setSeleccionMasiva({...seleccionMasiva, proceso: e.target.value})}
                  >
                    <option value="toma">📸 Toma de Fotos</option>
                    <option value="edicion">🎨 Edición Digital</option>
                    <option value="impreso">🖨️ Impresión/Lab</option>
                    <option value="empaquetado">📦 Empaque</option>
                    <option value="entregado">✅ Entrega</option>
                  </select>
                  
                  <select 
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={seleccionMasiva.responsable} 
                    onChange={(e) => setSeleccionMasiva({...seleccionMasiva, responsable: e.target.value})}
                  >
                    <option value="">Seleccionar responsable...</option>
                    {asistentes.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                  </select>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button 
                      onClick={aplicarResponsableMasivo}
                      className="w-full sm:flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 transition-colors"
                    >
                      Aplicar a grupo
                    </button>
                    <button 
                      onClick={eliminarResponsablesGrupo}
                      className="w-full sm:w-auto px-4 border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors"
                      title="Resetear grupo"
                    >
                      ✕ Resetear
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* NOTAS DE OPERACIÓN */}
            <section className="border border-gray-200 p-4 sm:p-6 bg-white">
              <h2 className="text-sm font-medium mb-3 sm:mb-4">📝 Notas de Operación</h2>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {gruposDisponibles.slice(0, 10).map(grupo => {
                  const notaActual = notasGrupo[grupo.id] || '';
                  const estaEditando = editandoNota === grupo.id;
                  
                  return (
                    <div key={grupo.id} className="border-b border-gray-100 pb-2">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-medium">{grupo.nombreCompleto || grupo.nombre}</p>
                        {!estaEditando && (
                          <button
                            onClick={() => {
                              setEditandoNota(grupo.id);
                              setNotaTemporal(notaActual);
                            }}
                            className="text-[8px] text-gray-400 hover:text-blue-500"
                            disabled={!esAdmin}
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                      {estaEditando ? (
                        <div className="mt-1">
                          <textarea
                            value={notaTemporal}
                            onChange={(e) => setNotaTemporal(e.target.value)}
                            className="w-full text-[10px] border border-gray-200 rounded p-1 focus:border-gray-400 outline-none"
                            rows={2}
                            placeholder="Escribe una nota sobre este grupo..."
                            autoFocus
                          />
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => {
                                guardarNotas({ ...notasGrupo, [grupo.id]: notaTemporal });
                                setEditandoNota(null);
                                setNotaTemporal('');
                              }}
                              className="text-[8px] bg-green-500 text-white px-2 py-0.5 rounded"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => {
                                setEditandoNota(null);
                                setNotaTemporal('');
                              }}
                              className="text-[8px] border border-gray-200 px-2 py-0.5 rounded"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        notaActual && (
                          <p className="text-[9px] text-gray-500 mt-1 italic">{notaActual}</p>
                        )
                      )}
                    </div>
                  );
                })}
                {gruposDisponibles.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">No hay grupos disponibles</p>
                )}
              </div>
            </section>

            {/* PERSONAL */}
            <section className="border border-gray-200 p-4 sm:p-6 bg-white">
              <h2 className="text-sm font-medium mb-3 sm:mb-4">👥 Personal</h2>
              {esAdmin && (
                <form onSubmit={agregarAsistente} className="flex flex-col sm:flex-row mb-4 gap-2 sm:gap-0">
                  <input 
                    type="text" 
                    placeholder="Nombre del empleado..." 
                    className="flex-1 border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none"
                    value={nuevoAsistente} 
                    onChange={(e) => setNuevoAsistente(e.target.value)} 
                  />
                  <button className="bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800 transition-colors sm:ml-2">
                    + Agregar
                  </button>
                </form>
              )}
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {asistentes.map(a => (
                  <div key={a.id} className="flex justify-between items-center border-b border-gray-100 py-2 text-sm">
                    <div>
                      <span className="break-words pr-2">{a.nombre}</span>
                      <span className="text-[8px] text-gray-400 ml-2">{a.email}</span>
                    </div>
                    {esAdmin && (
                      <button 
                        onClick={() => eliminarAsistente(a.id)} 
                        className="text-gray-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {asistentes.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No hay personal registrado</p>
                )}
              </div>
            </section>
          </div>

          {/* MONITOR DE PRODUCCIÓN */}
          <div className="lg:col-span-2">
            <div className="border border-gray-200">
              <div className="border-b border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-2 sm:gap-0">
                <h2 className="text-sm font-medium">📊 Monitor de Producción</h2>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  <span className="text-xs text-gray-500">{totalItems} pedidos</span>
                  <span className="text-xs text-green-600">Tiempo real</span>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-left min-w-[900px]">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr className="text-xs text-gray-500">
                      <th className="p-3 sm:p-4 font-medium">Cliente / Grupo</th>
                      <th className="p-3 sm:p-4 text-center font-medium">📸 Toma</th>
                      <th className="p-3 sm:p-4 text-center font-medium">🎨 Edición</th>
                      <th className="p-3 sm:p-4 text-center font-medium">🖨️ Impresión</th>
                      <th className="p-3 sm:p-4 text-center font-medium">📦 Empaque</th>
                      <th className="p-3 sm:p-4 text-center font-medium">✅ Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosGlobales.map((p, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-3 sm:p-4">
                          <p className="text-sm font-medium break-words">{p.cliente || 'Cliente'}</p>
                          <div className="flex flex-col text-[10px] text-gray-400">
                            {p.institucionNombre && <span>{p.institucionNombre}</span>}
                            <span>{p.grupoNombre}</span>
                          </div>
                          {p.grupoFechas && p.grupoFechas.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.grupoFechas.map((fecha, i) => (
                                <span key={i} className="text-[8px] bg-gray-100 px-1 rounded">{fecha.fecha}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.toma} 
                            resp={p.resp_toma} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'toma')}
                            disabled={!esAdmin && p.resp_toma !== usuario?.nombre}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.edicion} 
                            resp={p.resp_edicion} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'edicion')}
                            disabled={!esAdmin && p.resp_edicion !== usuario?.nombre}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.impreso} 
                            resp={p.resp_impreso} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'impreso')}
                            disabled={!esAdmin && p.resp_impreso !== usuario?.nombre}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.empaquetado} 
                            resp={p.resp_empaquetado} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'empaquetado')}
                            disabled={!esAdmin && p.resp_empaquetado !== usuario?.nombre}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.entregado} 
                            resp={p.resp_entregado} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'entregado')}
                            disabled={!esAdmin && p.resp_entregado !== usuario?.nombre}
                          />
                        </td>
                      </tr>
                    ))}
                    {pedidosGlobales.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-6 sm:p-8 text-center text-sm text-gray-400">
                          No hay pedidos registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* RESUMEN */}
        <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="border border-gray-200 p-3 sm:p-4 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">👥 Total Staff</p>
            <p className="text-lg sm:text-xl font-light">{asistentes.length} personas</p>
          </div>
          <div className="border border-gray-200 p-3 sm:p-4 bg-green-50">
            <p className="text-xs text-gray-500 mb-1">✅ Pedidos Completados</p>
            <p className="text-lg sm:text-xl font-light text-green-600">{conteoEntrega} de {totalItems}</p>
          </div>
          <div className="border border-gray-200 p-3 sm:p-4 bg-amber-50">
            <p className="text-xs text-gray-500 mb-1">⚙️ Pedidos en Proceso</p>
            <p className="text-lg sm:text-xl font-light text-amber-600">{totalItems - conteoEntrega} de {totalItems}</p>
          </div>
        </div>
      </div>

      {/* MODAL PARA CREAR TAREA */}
      {modalTarea && esAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-md w-full p-6">
            <h3 className="text-sm font-medium mb-4">➕ Asignar Nueva Tarea</h3>
            <form onSubmit={handleCrearTarea} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Título *</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.titulo}
                  onChange={(e) => setFormTarea({...formTarea, titulo: e.target.value})}
                  placeholder="Ej: Revisar fotos del grupo 3"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                <textarea
                  rows="3"
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.descripcion}
                  onChange={(e) => setFormTarea({...formTarea, descripcion: e.target.value})}
                  placeholder="Detalles de la tarea..."
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Asignar a *</label>
                <select
                  required
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.asignadoA}
                  onChange={(e) => setFormTarea({...formTarea, asignadoA: e.target.value})}
                >
                  <option value="">Seleccionar empleado</option>
                  {asistentes.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prioridad</label>
                  <select
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formTarea.prioridad}
                    onChange={(e) => setFormTarea({...formTarea, prioridad: e.target.value})}
                  >
                    <option value="baja">🟢 Baja</option>
                    <option value="media">🟡 Media</option>
                    <option value="alta">🔴 Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha límite</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formTarea.fechaLimite}
                    onChange={(e) => setFormTarea({...formTarea, fechaLimite: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800">
                  Asignar Tarea
                </button>
                <button type="button" onClick={() => { setModalTarea(false); resetFormTarea(); }} className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA EDITAR TAREA */}
      {modalEditarTarea && (esAdmin || tareaEditando?.asignadoA === usuario?.id) && tareaEditando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-md w-full p-6">
            <h3 className="text-sm font-medium mb-4">✏️ Editar Tarea</h3>
            <form onSubmit={guardarEdicionTarea} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Título *</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.titulo}
                  onChange={(e) => setFormTarea({...formTarea, titulo: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                <textarea
                  rows="3"
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.descripcion}
                  onChange={(e) => setFormTarea({...formTarea, descripcion: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Asignar a *</label>
                <select
                  required
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                  value={formTarea.asignadoA}
                  onChange={(e) => setFormTarea({...formTarea, asignadoA: e.target.value})}
                  disabled={!esAdmin}
                >
                  <option value="">Seleccionar empleado</option>
                  {asistentes.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prioridad</label>
                  <select
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formTarea.prioridad}
                    onChange={(e) => setFormTarea({...formTarea, prioridad: e.target.value})}
                  >
                    <option value="baja">🟢 Baja</option>
                    <option value="media">🟡 Media</option>
                    <option value="alta">🔴 Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha límite</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formTarea.fechaLimite}
                    onChange={(e) => setFormTarea({...formTarea, fechaLimite: e.target.value})}
                  />
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded text-[10px] text-gray-500">
                <p>Estado actual: <span className="font-medium">{tareaEditando.estado === 'completada' ? '✅ Completada' : '⏳ Pendiente'}</span></p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800">
                  Guardar Cambios
                </button>
                <button type="button" onClick={() => { setModalEditarTarea(false); resetFormTarea(); setTareaEditando(null); }} className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusIcon({ active, resp, onClick, disabled = false }) {
  return (
    <div className="flex flex-col items-center group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all duration-200 
          hover:scale-110 flex items-center justify-center
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${active 
            ? 'bg-green-500 border-green-600 text-white' 
            : 'bg-white border-gray-300 hover:border-gray-500'
          }
        `}
        title={active ? `Completado por: ${resp || 'Desconocido'}` : (disabled ? 'No tienes permiso' : 'Marcar como completado')}
      >
        {active && <span className="text-xs">✓</span>}
      </button>
      {resp && (
        <span className="text-[7px] sm:text-[8px] text-gray-500 mt-1 font-mono break-words max-w-[70px] text-center">
          {resp.length > 10 ? resp.substring(0, 8) + '...' : resp}
        </span>
      )}
    </div>
  );
}
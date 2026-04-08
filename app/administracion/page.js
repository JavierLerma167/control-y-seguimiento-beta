// app/administracion/page.js
"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import { useTasks } from '../hooks/useTasks';

export default function OperacionesPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    crear, 
    actualizar, 
    eliminar,
    suscribir, 
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
  const [guardando, setGuardando] = useState(false);
  const [vistaGrafica, setVistaGrafica] = useState('etapas');
  
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

  const esAdmin = usuario?.rol === 'admin';
  const savingRef = useRef(false);
  const isMounted = useRef(true);

  // --- CARGAR STAFF DESDE FIREBASE ---
  const cargarStaff = useCallback(async () => {
    if (!usuario) return;
    
    try {
      const staffData = await leerTodos(COLLECTIONS.USUARIOS);
      if (staffData && isMounted.current) {
        const empleados = staffData.filter(u => u.rol === 'empleado' && u.activo !== false);
        setAsistentes(empleados);
      }
    } catch (error) {
      console.error('Error cargando staff:', error);
    }
  }, [usuario, leerTodos]);

  useEffect(() => {
    cargarStaff();
  }, [cargarStaff]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A PLANILLA ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.PEDIDOS, (data) => {
      if (isMounted.current) {
        if (data && data.length > 0) {
          const pedidosData = data[0];
          if (pedidosData && pedidosData.instituciones) {
            setPlanillaFull(pedidosData);
            actualizarVistaPedidos(pedidosData);
          }
        }
        setCargado(true);
        setSincronizando(false);
      }
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
          grupoNotas: g.notas || ''
        })) || []
      ) || []
    );
    setPedidosGlobales(todos);
  }, []);

  const guardarEnFirebase = useCallback(async (nuevaPlanilla) => {
    if (!usuario) return;
    if (savingRef.current) return;
    
    savingRef.current = true;
    
    try {
      const existingDocs = await leerTodos(COLLECTIONS.PEDIDOS);
      if (existingDocs && existingDocs.length > 0) {
        await actualizar(COLLECTIONS.PEDIDOS, existingDocs[0].id, nuevaPlanilla);
      }
    } catch (error) {
      console.error('Error guardando en Firebase:', error);
    } finally {
      setTimeout(() => {
        savingRef.current = false;
      }, 500);
    }
  }, [usuario, leerTodos, actualizar]);

  // --- AGREGAR ASISTENTE (AHORA EN FIREBASE) ---
  const agregarAsistente = async (e) => {
    e.preventDefault();
    if (!nuevoAsistente.trim()) return;
    
    setGuardando(true);
    
    try {
      const nuevoStaff = { 
        nombre: nuevoAsistente.toUpperCase(),
        email: `${nuevoAsistente.toLowerCase().replace(/\s/g, '')}@evr.com`,
        rol: 'empleado',
        activo: true,
        fechaRegistro: new Date().toISOString()
      };
      
      const creado = await crear(COLLECTIONS.USUARIOS, nuevoStaff);
      
      if (creado) {
        await cargarStaff(); // Recargar lista actualizada
        setNuevoAsistente('');
        alert('Empleado agregado correctamente');
      } else {
        alert('Error al agregar empleado');
      }
    } catch (error) {
      console.error('Error agregando asistente:', error);
      alert('Error al agregar el empleado');
    } finally {
      setGuardando(false);
    }
  };

  // --- ELIMINAR ASISTENTE (AHORA EN FIREBASE) ---
  const eliminarAsistente = async (id) => {
    if (!confirm("¿Eliminar este miembro del staff? Esta acción no se puede deshacer.")) return;
    
    setGuardando(true);
    
    try {
      // Opción: Marcar como inactivo en lugar de eliminar físicamente
      const exito = await actualizar(COLLECTIONS.USUARIOS, id, { 
        activo: false,
        eliminadoEn: new Date().toISOString(),
        eliminadoPor: usuario?.nombre
      });
      
      if (exito) {
        await cargarStaff(); // Recargar lista actualizada
        alert('Empleado eliminado correctamente');
      } else {
        alert('Error al eliminar empleado');
      }
    } catch (error) {
      console.error('Error eliminando asistente:', error);
      alert('Error al eliminar el empleado');
    } finally {
      setGuardando(false);
    }
  };

  // --- FUNCIONES DE TAREAS ---
  const handleCrearTarea = useCallback(async (e) => {
    e.preventDefault();
    
    if (!formTarea.asignadoA) {
      alert('Selecciona un empleado');
      return;
    }

    setGuardando(true);
    
    try {
      const tareaCreada = await tasks.crearTarea(formTarea);
      if (tareaCreada) {
        setModalTarea(false);
        resetFormTarea();
        alert('Tarea creada correctamente');
      } else {
        alert('Error al crear la tarea');
      }
    } catch (error) {
      console.error('Error creando tarea:', error);
      alert('Error al crear la tarea');
    } finally {
      setGuardando(false);
    }
  }, [tasks, formTarea]);

  const abrirEditarTarea = (tarea) => {
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

    setGuardando(true);
    
    try {
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
        alert('Tarea actualizada correctamente');
      } else {
        alert('Error al actualizar la tarea');
      }
    } catch (error) {
      console.error('Error editando tarea:', error);
      alert('Error al editar la tarea');
    } finally {
      setGuardando(false);
    }
  }, [tasks, formTarea, tareaEditando]);

  const eliminarTarea = useCallback(async (tareaId) => {
    if (!confirm('¿Estás seguro de eliminar esta tarea? Esta acción no se puede deshacer.')) return;
    
    setGuardando(true);
    
    try {
      const exito = await tasks.eliminarTarea(tareaId);
      if (exito) {
        alert('Tarea eliminada correctamente');
      } else {
        alert('Error al eliminar la tarea');
      }
    } catch (error) {
      console.error('Error al eliminar tarea:', error);
      alert('Error al eliminar la tarea');
    } finally {
      setGuardando(false);
    }
  }, [tasks]);

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
    if (!planillaFull.instituciones) return;
    
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
                return { 
                  ...r, 
                  [campo]: nuevoEstado,
                  [`resp_${campo}`]: nuevoEstado ? responsableAsignado : ""
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
  }, [planillaFull, usuario?.nombre, guardarEnFirebase, actualizarVistaPedidos]);

  const aplicarResponsableMasivo = useCallback(() => {
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
                [`resp_${proceso}`]: responsable
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
    alert(`✅ ${proceso} asignado a ${responsable} para el grupo seleccionado`);
  }, [planillaFull, seleccionMasiva, guardarEnFirebase, actualizarVistaPedidos]);

  const eliminarResponsablesGrupo = useCallback(() => {
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
    alert('✅ Responsables del grupo limpiados');
  }, [planillaFull, seleccionMasiva.grupoId, guardarEnFirebase, actualizarVistaPedidos]);

  // --- ESTADÍSTICAS MEMOIZADAS ---
  const estadisticas = useMemo(() => {
    const totalItems = pedidosGlobales.length;
    const conteoToma = pedidosGlobales.filter(p => p.toma).length;
    const conteoEdicion = pedidosGlobales.filter(p => p.edicion).length;
    const conteoImpresion = pedidosGlobales.filter(p => p.impreso).length;
    const conteoEmpaque = pedidosGlobales.filter(p => p.empaquetado).length;
    const conteoEntrega = pedidosGlobales.filter(p => p.entregado).length;
    
    return {
      totalItems,
      conteoToma,
      conteoEdicion,
      conteoImpresion,
      conteoEmpaque,
      conteoEntrega,
      porcentajeToma: totalItems > 0 ? (conteoToma / totalItems) * 100 : 0,
      porcentajeEdicion: totalItems > 0 ? (conteoEdicion / totalItems) * 100 : 0,
      porcentajeImpresion: totalItems > 0 ? (conteoImpresion / totalItems) * 100 : 0,
      porcentajeEmpaque: totalItems > 0 ? (conteoEmpaque / totalItems) * 100 : 0,
      porcentajeEntrega: totalItems > 0 ? (conteoEntrega / totalItems) * 100 : 0
    };
  }, [pedidosGlobales]);

  // --- EFICIENCIA EMPLEADOS MEMOIZADA ---
  const eficienciaEmpleados = useMemo(() => {
    return asistentes.map(emp => {
      const tareasAsignadas = tasks?.tareas?.filter(t => t.asignadoA === emp.id) || [];
      const tareasCompletadas = tareasAsignadas.filter(t => t.estado === 'completada');
      const pedidosCompletados = pedidosGlobales.filter(p => 
        p.resp_toma === emp.nombre || 
        p.resp_edicion === emp.nombre || 
        p.resp_impreso === emp.nombre || 
        p.resp_empaquetado === emp.nombre
      ).length;
      
      return {
        ...emp,
        tareasTotal: tareasAsignadas.length,
        tareasCompletadas: tareasCompletadas.length,
        eficienciaTareas: tareasAsignadas.length > 0 
          ? Math.round((tareasCompletadas.length / tareasAsignadas.length) * 100) 
          : 0,
        pedidosCompletados
      };
    });
  }, [asistentes, tasks?.tareas, pedidosGlobales]);

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

  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Cargando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-12 font-light">
      <div className="max-w-7xl mx-auto">
        
        {/* Indicadores de estado */}
        {(sincronizando || guardando) && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {guardando ? 'Guardando...' : 'Sincronizando...'}
          </div>
        )}
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-10 gap-3 sm:gap-0">
          <div className="w-full md:w-auto">
            <nav className="mb-2 flex items-center gap-4">
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Volver al Dashboard
              </Link>
              {tasks?.tareasPendientes > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full animate-pulse">
                  {tasks.tareasPendientes} tarea(s) pendiente(s)
                </span>
              )}
            </nav>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">Control de Operaciones</h1>
            <p className="text-xs text-gray-400 mt-1">
              Vinculado con Planilla de Pedidos · {esAdmin ? 'Administrador' : 'Empleado'}
            </p>
          </div>
          <div className="mt-2 md:mt-0 text-right w-full md:w-auto">
            <p className="text-xs text-gray-400 mb-1">Avance Global</p>
            <p className="text-2xl sm:text-3xl font-light">
              {estadisticas.totalItems > 0 ? Math.round((estadisticas.conteoEntrega / estadisticas.totalItems) * 100) : 0}%
            </p>
          </div>
        </header>

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
                  <span className="text-sm font-light">{estadisticas.conteoToma}/{estadisticas.totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajeToma}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{estadisticas.porcentajeToma.toFixed(0)}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">🎨 Edición</span>
                  <span className="text-sm font-light">{estadisticas.conteoEdicion}/{estadisticas.totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajeEdicion}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{estadisticas.porcentajeEdicion.toFixed(0)}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">🖨️ Impresión</span>
                  <span className="text-sm font-light">{estadisticas.conteoImpresion}/{estadisticas.totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajeImpresion}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{estadisticas.porcentajeImpresion.toFixed(0)}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">📦 Empaque</span>
                  <span className="text-sm font-light">{estadisticas.conteoEmpaque}/{estadisticas.totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajeEmpaque}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{estadisticas.porcentajeEmpaque.toFixed(0)}% completado</p>
              </div>

              <div className="border border-gray-200 p-3 bg-green-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">✅ Entregado</span>
                  <span className="text-sm font-light text-green-600">{estadisticas.conteoEntrega}/{estadisticas.totalItems}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-600 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajeEntrega}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">{estadisticas.porcentajeEntrega.toFixed(0)}% entregado</p>
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
                </div>
              ))}
              {eficienciaEmpleados.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No hay empleados registrados</p>
              )}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-8 sm:mb-12">
          {[
            { label: "Toma de Fotos", count: estadisticas.conteoToma, total: estadisticas.totalItems, color: "bg-blue-100" },
            { label: "Edición Digital", count: estadisticas.conteoEdicion, total: estadisticas.totalItems, color: "bg-green-100" },
            { label: "Impresión/Lab", count: estadisticas.conteoImpresion, total: estadisticas.totalItems, color: "bg-orange-100" },
            { label: "Empaque", count: estadisticas.conteoEmpaque, total: estadisticas.totalItems, color: "bg-purple-100" },
            { label: "Entregados", count: estadisticas.conteoEntrega, total: estadisticas.totalItems, color: "bg-green-100" }
          ].map((item, i) => (
            <div key={i} className={`border border-gray-200 p-3 sm:p-4 ${item.color}`}>
              <p className="text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-2">{item.label}</p>
              <div className="flex justify-between items-end">
                <p className="text-xl sm:text-2xl font-light">{item.count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">de {item.total}</p>
              </div>
              <div className="w-full h-px bg-gray-200 mt-2 sm:mt-3">
                <div 
                  className="h-px bg-gray-700 transition-all duration-300" 
                  style={{ width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
          
          <div className="space-y-4 sm:space-y-6">
            
            {/* SECCIÓN DE TAREAS */}
            <section className="border border-gray-200 p-4 sm:p-6 bg-white">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-medium">📋 Mis Tareas</h2>
                {esAdmin && (
                  <button
                    onClick={() => setModalTarea(true)}
                    className="bg-gray-900 text-white px-3 py-1 text-xs hover:bg-gray-800"
                  >
                    + Asignar Tarea
                  </button>
                )}
              </div>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {tasks?.tareas?.filter(t => !esAdmin ? t.asignadoA === usuario?.id : true).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No hay tareas asignadas</p>
                ) : (
                  tasks?.tareas?.filter(t => !esAdmin ? t.asignadoA === usuario?.id : true).map(tarea => (
                    <div key={tarea.id} className={`border p-3 ${tarea.estado === 'completada' ? 'bg-gray-50' : 'bg-white'} group`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xs font-medium flex-1">{tarea.titulo}</h3>
                        <div className="flex gap-1">
                          <span className={`text-[8px] px-2 py-1 ${getColorPrioridad(tarea.prioridad)}`}>
                            {tarea.prioridad}
                          </span>
                          {esAdmin && tarea.estado !== 'completada' && (
                            <>
                              <button
                                onClick={() => abrirEditarTarea(tarea)}
                                className="text-gray-400 hover:text-blue-500 transition-colors"
                                title="Editar tarea"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => eliminarTarea(tarea.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                                title="Eliminar tarea"
                              >
                                🗑️
                              </button>
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
                  <button 
                    type="submit"
                    disabled={guardando}
                    className="bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800 transition-colors sm:ml-2 disabled:opacity-50"
                  >
                    {guardando ? 'Agregando...' : '+ Agregar'}
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
                        disabled={guardando}
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

          <div className="lg:col-span-2">
            <div className="border border-gray-200">
              <div className="border-b border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-2 sm:gap-0">
                <h2 className="text-sm font-medium">📊 Monitor de Producción</h2>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  <span className="text-xs text-gray-500">{estadisticas.totalItems} pedidos</span>
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
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.toma} 
                            resp={p.resp_toma} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'toma')}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.edicion} 
                            resp={p.resp_edicion} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'edicion')}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.impreso} 
                            resp={p.resp_impreso} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'impreso')}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.empaquetado} 
                            resp={p.resp_empaquetado} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'empaquetado')}
                          />
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <StatusIcon 
                            active={p.entregado} 
                            resp={p.resp_entregado} 
                            onClick={() => toggleStatusIndividual(p.grupoId, p.id, 'entregado')}
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

        <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="border border-gray-200 p-3 sm:p-4 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">👥 Total Staff</p>
            <p className="text-lg sm:text-xl font-light">{asistentes.length} personas</p>
          </div>
          <div className="border border-gray-200 p-3 sm:p-4 bg-green-50">
            <p className="text-xs text-gray-500 mb-1">✅ Pedidos Completados</p>
            <p className="text-lg sm:text-xl font-light text-green-600">{estadisticas.conteoEntrega} de {estadisticas.totalItems}</p>
          </div>
          <div className="border border-gray-200 p-3 sm:p-4 bg-amber-50">
            <p className="text-xs text-gray-500 mb-1">⚙️ Pedidos en Proceso</p>
            <p className="text-lg sm:text-xl font-light text-amber-600">{estadisticas.totalItems - estadisticas.conteoEntrega} de {estadisticas.totalItems}</p>
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
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {guardando ? 'Asignando...' : 'Asignar Tarea'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalTarea(false);
                    resetFormTarea();
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

      {/* MODAL PARA EDITAR TAREA */}
      {modalEditarTarea && esAdmin && tareaEditando && (
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

              <div className="bg-gray-50 p-2 rounded text-[10px] text-gray-500">
                <p>Estado actual: <span className="font-medium">{tareaEditando.estado === 'completada' ? '✅ Completada' : '⏳ Pendiente'}</span></p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalEditarTarea(false);
                    resetFormTarea();
                    setTareaEditando(null);
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
    </main>
  );
}

function StatusIcon({ active, resp, onClick }) {
  return (
    <div className="flex flex-col items-center group">
      <button
        onClick={onClick}
        className={`
          w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all duration-200 
          hover:scale-110 flex items-center justify-center
          ${active 
            ? 'bg-green-500 border-green-600 text-white' 
            : 'bg-white border-gray-300 hover:border-gray-500'
          }
        `}
        title={active ? `Completado por: ${resp || 'Desconocido'}` : 'Marcar como completado'}
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
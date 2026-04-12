// app/pedidos/page.js
"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import Link from 'next/link';
import * as XLSX from 'xlsx';

export default function PlanillaFotosPage() {
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
  
  const [instituciones, setInstituciones] = useState([]);
  const [institucionActiva, setInstitucionActiva] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [staff, setStaff] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [modalInstitucion, setModalInstitucion] = useState(false);
  const [nuevaInstitucion, setNuevaInstitucion] = useState({ nombre: '', director: '', fecha: '' });
  const [mostrarTotalesInstituciones, setMostrarTotalesInstituciones] = useState(false);
  const [mostrarTotalesGrupos, setMostrarTotalesGrupos] = useState(false);
  const [mostrarTareasPedido, setMostrarTareasPedido] = useState(null);

  const TAMAÑOS_OPCIONES = ["5x7", "6x8", "8x10", "Cartera", "Otro"];
  const PAQUETES_OPCIONES = ["Esencial", "Clasico", "Cibuta 185", "Mesa 110", "Otro"];
  
  const esAdmin = usuario?.rol === 'admin';
  const [guardando, setGuardando] = useState(false);

  // --- CARGAR STAFF DESDE FIREBASE ---
  useEffect(() => {
    if (!usuario) return;
    
    const cargarStaff = async () => {
      const usuariosData = await leerTodos(COLLECTIONS.USUARIOS);
      if (usuariosData) {
        const empleados = usuariosData.filter(u => u.rol === 'empleado' && u.activo !== false);
        setStaff(empleados);
      }
    };
    cargarStaff();
  }, [usuario, leerTodos]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A PEDIDOS ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    
    const unsubscribe = suscribir(COLLECTIONS.PEDIDOS, (data) => {
      if (data && data.length > 0) {
        const pedidoData = data[0];
        if (pedidoData && pedidoData.instituciones) {
          setInstituciones(pedidoData.instituciones);
          if (pedidoData.instituciones.length > 0 && !institucionActiva) {
            setInstitucionActiva(pedidoData.instituciones[0].id);
          }
        } else {
          // Crear estructura inicial si no existe
          const institucionDefault = {
            id: Date.now().toString(),
            nombre: 'INSTITUCIÓN PRINCIPAL',
            director: '',
            fecha: '',
            grupos: [{
              id: (Date.now() + 1).toString(),
              nombre: 'GRUPO 01',
              notas: '',
              registros: []
            }]
          };
          setInstituciones([institucionDefault]);
          setInstitucionActiva(institucionDefault.id);
        }
      } else {
        // No hay datos, crear estructura inicial
        const institucionDefault = {
          id: Date.now().toString(),
          nombre: 'INSTITUCIÓN PRINCIPAL',
          director: '',
          fecha: '',
          grupos: [{
            id: (Date.now() + 1).toString(),
            nombre: 'GRUPO 01',
            notas: '',
            registros: []
          }]
        };
        setInstituciones([institucionDefault]);
        setInstitucionActiva(institucionDefault.id);
      }
      setCargado(true);
      setSincronizando(false);
    });
    
    return () => unsubscribe();
  }, [usuario, suscribir]);

  // --- GUARDAR CAMBIOS EN FIREBASE ---
  const guardarEnFirebase = useCallback(async (nuevasInstituciones) => {
    if (!usuario) return;
    if (guardando) return;
    
    setGuardando(true);
    
    try {
      const pedidosDoc = await leerTodos(COLLECTIONS.PEDIDOS);
      const dataToSave = { 
        instituciones: nuevasInstituciones,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario.nombre,
        actualizadoPorId: usuario.id
      };
      
      if (pedidosDoc && pedidosDoc.length > 0) {
        await actualizar(COLLECTIONS.PEDIDOS, pedidosDoc[0].id, dataToSave);
      } else {
        await crear(COLLECTIONS.PEDIDOS, {
          ...dataToSave,
          creadoEn: new Date().toISOString(),
          creadoPor: usuario.nombre,
          version: '2.0'
        });
      }
    } catch (error) {
      console.error('Error guardando en Firebase:', error);
      alert('Error al guardar los cambios');
    } finally {
      setGuardando(false);
    }
  }, [usuario, leerTodos, actualizar, crear, guardando]);

  // --- ACTUALIZAR INSTITUCIONES Y GUARDAR ---
  const actualizarInstituciones = useCallback((nuevasInstituciones) => {
    setInstituciones(nuevasInstituciones);
    guardarEnFirebase(nuevasInstituciones);
  }, [guardarEnFirebase]);

  const institucionActual = instituciones.find(inst => inst.id === institucionActiva) || instituciones[0];
  const grupos = institucionActual?.grupos || [];

  // --- CRUD INSTITUCIONES ---
  const agregarInstitucion = (e) => {
    e.preventDefault();
    if (!nuevaInstitucion.nombre.trim()) return;

    const nuevaInst = {
      id: Date.now().toString(),
      nombre: nuevaInstitucion.nombre.toUpperCase(),
      director: nuevaInstitucion.director,
      fecha: nuevaInstitucion.fecha,
      grupos: [{
        id: (Date.now() + 1).toString(),
        nombre: 'GRUPO 01',
        notas: '',
        registros: []
      }]
    };

    actualizarInstituciones([...instituciones, nuevaInst]);
    setInstitucionActiva(nuevaInst.id);
    setModalInstitucion(false);
    setNuevaInstitucion({ nombre: '', director: '', fecha: '' });
  };

  const eliminarInstitucion = (id) => {
    if (instituciones.length <= 1) {
      alert("Debe haber al menos una institución");
      return;
    }

    if (confirm("¿Eliminar esta institución y todos sus grupos?")) {
      const nuevasInstituciones = instituciones.filter(inst => inst.id !== id);
      actualizarInstituciones(nuevasInstituciones);
      setInstitucionActiva(nuevasInstituciones[0].id);
    }
  };

  const actualizarInstitucion = (id, campo, valor) => {
    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === id ? { ...inst, [campo]: valor } : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  // --- CRUD GRUPOS ---
  const agregarGrupo = () => {
    if (!institucionActual) return;

    const nuevoGrupo = { 
      id: Date.now().toString(), 
      nombre: `NUEVO GRUPO ${institucionActual.grupos.length + 1}`, 
      notas: '', 
      registros: [{ 
        id: (Date.now() + 1).toString(), 
        cliente: '', 
        paquete: '',
        paquetePersonalizado: '',
        tamPaquete: '5x7',
        tamPaquetePersonalizado: '',
        cantPaquetes: 1, 
        costoPaquete: 0, 
        extras: [], 
        anticipo: 0, 
        toma: false, 
        edicion: false, 
        impreso: false,
        empaquetado: false,
        entregado: false, 
        pagadoCompleto: false 
      }] 
    };

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? { ...inst, grupos: [...inst.grupos, nuevoGrupo] }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  const eliminarGrupo = (grupoId) => {
    if (!institucionActual) return;

    if (confirm("¿Eliminar TODO el grupo, sus notas y registros financieros?")) {
      const nuevasInstituciones = instituciones.map(inst => 
        inst.id === institucionActual.id 
          ? { ...inst, grupos: inst.grupos.filter(g => g.id !== grupoId) }
          : inst
      );
      actualizarInstituciones(nuevasInstituciones);
    }
  };

  const actualizarGrupo = (grupoId, campo, valor) => {
    if (!institucionActual) return;

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId ? { ...g, [campo]: valor } : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  // --- CRUD FILAS (CLIENTES) ---
  const agregarFila = (grupoId) => {
    if (!institucionActual) return;

    const nuevaFila = { 
      id: Date.now().toString(), 
      cliente: '', 
      paquete: '',
      paquetePersonalizado: '',
      tamPaquete: '5x7',
      tamPaquetePersonalizado: '',
      cantPaquetes: 1, 
      costoPaquete: 0, 
      extras: [], 
      anticipo: 0, 
      toma: false, 
      edicion: false, 
      impreso: false,
      empaquetado: false,
      entregado: false, 
      pagadoCompleto: false 
    };

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId 
                ? { ...g, registros: [...g.registros, nuevaFila] }
                : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  const eliminarFila = (grupoId, filaId) => {
    if (!institucionActual) return;

    if (confirm("¿Eliminar este cliente y todos sus datos?")) {
      const nuevasInstituciones = instituciones.map(inst => 
        inst.id === institucionActual.id 
          ? {
              ...inst,
              grupos: inst.grupos.map(g => 
                g.id === grupoId 
                  ? { ...g, registros: g.registros.filter(r => r.id !== filaId) }
                  : g
              )
            }
          : inst
      );
      actualizarInstituciones(nuevasInstituciones);
    }
  };

  const actualizarFila = (grupoId, filaId, campo, valor) => {
    if (!institucionActual) return;

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId 
                ? {
                    ...g,
                    registros: g.registros.map(r => 
                      r.id === filaId ? { ...r, [campo]: valor } : r
                    )
                  }
                : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  // --- CRUD EXTRAS ---
  const agregarExtra = (grupoId, filaId) => {
    if (!institucionActual) return;

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId 
                ? {
                    ...g,
                    registros: g.registros.map(r => 
                      r.id === filaId 
                        ? { 
                            ...r, 
                            extras: [...r.extras, { 
                              id: Date.now().toString(), 
                              tam: '5x7', 
                              tamPersonalizado: '',
                              cant: 1, 
                              precio: 0 
                            }] 
                          }
                        : r
                    )
                  }
                : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  const actualizarExtra = (grupoId, filaId, extraId, campo, valor) => {
    if (!institucionActual) return;

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId 
                ? {
                    ...g,
                    registros: g.registros.map(r => 
                      r.id === filaId 
                        ? {
                            ...r,
                            extras: r.extras.map(e => 
                              e.id === extraId ? { ...e, [campo]: valor } : e
                            )
                          }
                        : r
                    )
                  }
                : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  const eliminarExtra = (grupoId, filaId, extraId) => {
    if (!institucionActual) return;

    const nuevasInstituciones = instituciones.map(inst => 
      inst.id === institucionActual.id 
        ? {
            ...inst,
            grupos: inst.grupos.map(g => 
              g.id === grupoId 
                ? {
                    ...g,
                    registros: g.registros.map(r => 
                      r.id === filaId 
                        ? { ...r, extras: r.extras.filter(e => e.id !== extraId) }
                        : r
                    )
                  }
                : g
            )
          }
        : inst
    );
    actualizarInstituciones(nuevasInstituciones);
  };

  // --- CÁLCULOS ---
  const calcularTotales = (reg) => {
    const totalPaquetes = (Number(reg.cantPaquetes) || 0) * (Number(reg.costoPaquete) || 0);
    const totalExtras = reg.extras?.reduce((sum, e) => sum + (Number(e.cant) * Number(e.precio)), 0) || 0;
    const granTotal = totalPaquetes + totalExtras;
    const saldoPendiente = granTotal - (Number(reg.anticipo) || 0);
    return { granTotal, totalPaquetes, saldoPendiente };
  };

  const calcularTotalesInstitucion = (institucion) => {
    const registros = institucion.grupos?.flatMap(g => g.registros) || [];
    const total = registros.reduce((sum, r) => sum + calcularTotales(r).granTotal, 0);
    const anticipos = registros.reduce((sum, r) => sum + (Number(r.anticipo) || 0), 0);
    const saldo = registros.reduce((sum, r) => sum + calcularTotales(r).saldoPendiente, 0);
    const entregados = registros.filter(r => r.entregado).length;
    const totalClientes = registros.length;
    return { total, anticipos, saldo, entregados, totalClientes };
  };

  const calcularTotalesGrupo = (grupo) => {
    const registros = grupo.registros || [];
    const total = registros.reduce((sum, r) => sum + calcularTotales(r).granTotal, 0);
    const anticipos = registros.reduce((sum, r) => sum + (Number(r.anticipo) || 0), 0);
    const saldo = registros.reduce((sum, r) => sum + calcularTotales(r).saldoPendiente, 0);
    const entregados = registros.filter(r => r.entregado).length;
    const totalClientes = registros.length;
    return { total, anticipos, saldo, entregados, totalClientes };
  };

  const todosLosRegistros = instituciones.flatMap(inst => 
    inst.grupos?.flatMap(g => g.registros) || []
  );

  const totalGlobal = todosLosRegistros.reduce((sum, r) => sum + calcularTotales(r).granTotal, 0);
  const totalAnticipos = todosLosRegistros.reduce((sum, r) => sum + (Number(r.anticipo) || 0), 0);
  const totalSaldo = todosLosRegistros.reduce((sum, r) => sum + calcularTotales(r).saldoPendiente, 0);
  const totalEntregados = todosLosRegistros.filter(r => r.entregado).length;

  const totalesPorInstitucion = instituciones.map(inst => ({
    id: inst.id,
    nombre: inst.nombre,
    ...calcularTotalesInstitucion(inst)
  }));

  const totalesPorGrupo = institucionActual?.grupos?.map(grupo => ({
    id: grupo.id,
    nombre: grupo.nombre,
    ...calcularTotalesGrupo(grupo)
  })) || [];

  // Filtrar registros por búsqueda
  const registrosFiltradosPorGrupo = useMemo(() => {
    if (!busqueda) return null;
    
    const resultados = {};
    instituciones.forEach(inst => {
      inst.grupos?.forEach(grupo => {
        const filtrados = grupo.registros.filter(r => 
          r.cliente?.toLowerCase().includes(busqueda.toLowerCase())
        );
        if (filtrados.length > 0) {
          if (!resultados[inst.id]) resultados[inst.id] = {};
          resultados[inst.id][grupo.id] = filtrados;
        }
      });
    });
    return resultados;
  }, [instituciones, busqueda]);

  // --- FUNCIONES DE EXPORTACIÓN A EXCEL ---
  const exportarAExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();
      
      // 1. Hoja: Resumen Global
      const resumenData = [
        ['RESUMEN GLOBAL'],
        ['Fecha de exportación:', new Date().toLocaleString()],
        ['Total Proyectado', `$${totalGlobal.toLocaleString()}`],
        ['Total Anticipos', `$${totalAnticipos.toLocaleString()}`],
        ['Saldo Pendiente', `$${totalSaldo.toLocaleString()}`],
        ['Total Clientes', todosLosRegistros.length],
        ['Total Entregados', totalEntregados],
        ['Eficiencia Global', `${todosLosRegistros.length > 0 ? Math.round((totalEntregados / todosLosRegistros.length) * 100) : 0}%`],
        [],
        ['TOTALES POR INSTITUCIÓN'],
        ['Institución', 'Total Proyectado', 'Anticipos', 'Saldo Pendiente', 'Clientes', 'Entregados', 'Eficiencia']
      ];
      
      totalesPorInstitucion.forEach(inst => {
        resumenData.push([
          inst.nombre,
          `$${inst.total.toLocaleString()}`,
          `$${inst.anticipos.toLocaleString()}`,
          `$${inst.saldo.toLocaleString()}`,
          inst.totalClientes,
          inst.entregados,
          `${inst.totalClientes > 0 ? Math.round((inst.entregados / inst.totalClientes) * 100) : 0}%`
        ]);
      });
      
      const resumenSheet = XLSX.utils.aoa_to_sheet(resumenData);
      resumenSheet['!cols'] = [{wch:30}, {wch:20}, {wch:20}, {wch:20}, {wch:15}, {wch:15}, {wch:15}];
      XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen Global');
      
      // 2. Hoja por cada institución con sus grupos y clientes
      instituciones.forEach(inst => {
        const sheetData = [];
        
        // Encabezado de la institución
        sheetData.push([`INSTITUCIÓN: ${inst.nombre}`]);
        sheetData.push(['Director:', inst.director || '']);
        sheetData.push(['Fecha:', inst.fecha || '']);
        sheetData.push([]);
        
        // Totales de la institución
        const instTotales = calcularTotalesInstitucion(inst);
        sheetData.push(['TOTALES DE LA INSTITUCIÓN']);
        sheetData.push(['Total Proyectado:', `$${instTotales.total.toLocaleString()}`]);
        sheetData.push(['Anticipos:', `$${instTotales.anticipos.toLocaleString()}`]);
        sheetData.push(['Saldo Pendiente:', `$${instTotales.saldo.toLocaleString()}`]);
        sheetData.push(['Total Clientes:', instTotales.totalClientes]);
        sheetData.push(['Entregados:', instTotales.entregados]);
        sheetData.push([]);
        
        // Recorrer grupos
        inst.grupos?.forEach(grupo => {
          sheetData.push([`=== GRUPO: ${grupo.nombre} ===`]);
          if (grupo.notas) {
            sheetData.push(['Notas del grupo:', grupo.notas]);
          }
          sheetData.push([]);
          
          // Totales del grupo
          const grupoTotales = calcularTotalesGrupo(grupo);
          sheetData.push(['TOTALES DEL GRUPO']);
          sheetData.push(['Total Proyectado:', `$${grupoTotales.total.toLocaleString()}`]);
          sheetData.push(['Anticipos:', `$${grupoTotales.anticipos.toLocaleString()}`]);
          sheetData.push(['Saldo Pendiente:', `$${grupoTotales.saldo.toLocaleString()}`]);
          sheetData.push(['Clientes:', grupoTotales.totalClientes]);
          sheetData.push(['Entregados:', grupoTotales.entregados]);
          sheetData.push([]);
          
          // Encabezados de clientes
          sheetData.push([
            'CLIENTE', 
            'PAQUETE', 
            'PAQUETE PERSONALIZADO',
            'TAMAÑO PAQUETE', 
            'TAMAÑO PERSONALIZADO',
            'CANTIDAD', 
            'COSTO UNITARIO', 
            'SUBTOTAL PAQUETE',
            'EXTRAS (Tamaño/Cant/Precio/Subtotal)', 
            'TOTAL', 
            'ANTICIPO', 
            'SALDO', 
            'TOMA', 
            'EDICIÓN', 
            'IMPRESIÓN', 
            'EMPAQUETADO', 
            'ENTREGADO', 
            'PAGADO COMPLETO'
          ]);
          
          // Datos de clientes
          grupo.registros?.forEach(reg => {
            const { granTotal, totalPaquetes, saldoPendiente } = calcularTotales(reg);
            
            // Formatear extras como string
            const extrasStr = reg.extras?.map(e => {
              const subtotal = (Number(e.cant) || 0) * (Number(e.precio) || 0);
              const tamStr = e.tam === 'Otro' ? (e.tamPersonalizado || 'Otro') : e.tam;
              return `${tamStr} x${e.cant} @$${e.precio}=$${subtotal}`;
            }).join('; ') || '';
            
            // Personalización de paquete
            const paqueteMostrar = reg.paquete === 'Otro' ? (reg.paquetePersonalizado || 'Otro') : reg.paquete;
            const tamMostrar = reg.tamPaquete === 'Otro' ? (reg.tamPaquetePersonalizado || 'Otro') : reg.tamPaquete;
            
            sheetData.push([
              reg.cliente || '',
              reg.paquete || '',
              reg.paquetePersonalizado || '',
              reg.tamPaquete || '',
              reg.tamPaquetePersonalizado || '',
              reg.cantPaquetes || 0,
              reg.costoPaquete || 0,
              totalPaquetes,
              extrasStr,
              granTotal,
              reg.anticipo || 0,
              saldoPendiente,
              reg.toma ? 'Sí' : 'No',
              reg.edicion ? 'Sí' : 'No',
              reg.impreso ? 'Sí' : 'No',
              reg.empaquetado ? 'Sí' : 'No',
              reg.entregado ? 'Sí' : 'No',
              reg.pagadoCompleto ? 'Sí' : 'No'
            ]);
          });
          
          sheetData.push([]); // Espacio entre grupos
        });
        
        const sheetName = inst.nombre.replace(/[\\/*?:[\]]/g, '').substring(0, 31);
        const sheet = XLSX.utils.aoa_to_sheet(sheetData);
        sheet['!cols'] = [
          {wch:25}, {wch:20}, {wch:25}, {wch:15}, {wch:20},
          {wch:10}, {wch:15}, {wch:15}, {wch:50}, {wch:15},
          {wch:15}, {wch:15}, {wch:10}, {wch:10}, {wch:10}, 
          {wch:10}, {wch:10}, {wch:15}
        ];
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      });
      
      // 3. Hoja con todos los clientes (vista maestra)
      const todosClientesData = [
        ['LISTA MAESTRA DE CLIENTES'],
        ['Fecha de exportación:', new Date().toLocaleString()],
        [],
        ['Institución', 'Grupo', 'Cliente', 'Paquete', 'Tamaño', 'Cantidad', 'Total', 'Anticipo', 'Saldo', 'Entregado', 'Pagado']
      ];
      
      instituciones.forEach(inst => {
        inst.grupos?.forEach(grupo => {
          grupo.registros?.forEach(reg => {
            const { granTotal, saldoPendiente } = calcularTotales(reg);
            todosClientesData.push([
              inst.nombre,
              grupo.nombre,
              reg.cliente || '',
              reg.paquete === 'Otro' ? (reg.paquetePersonalizado || 'Otro') : reg.paquete,
              reg.tamPaquete === 'Otro' ? (reg.tamPaquetePersonalizado || 'Otro') : reg.tamPaquete,
              reg.cantPaquetes || 0,
              granTotal,
              reg.anticipo || 0,
              saldoPendiente,
              reg.entregado ? 'Sí' : 'No',
              reg.pagadoCompleto ? 'Sí' : 'No'
            ]);
          });
        });
      });
      
      const maestraSheet = XLSX.utils.aoa_to_sheet(todosClientesData);
      maestraSheet['!cols'] = [{wch:25}, {wch:20}, {wch:25}, {wch:20}, {wch:15}, {wch:10}, {wch:15}, {wch:15}, {wch:15}, {wch:12}, {wch:12}];
      XLSX.utils.book_append_sheet(workbook, maestraSheet, 'Lista Maestra');
      
      // 4. Hoja con producción por empleado
      const produccionData = [
        ['PRODUCCIÓN POR EMPLEADO'],
        ['Fecha de exportación:', new Date().toLocaleString()],
        [],
        ['Empleado', 'Toma', 'Edición', 'Impresión', 'Empaque', 'Total Tareas']
      ];
      
      const produccionPorEmpleado = {};
      todosLosRegistros.forEach(reg => {
        const pasos = ['toma', 'edicion', 'impreso', 'empaquetado'];
        pasos.forEach(paso => {
          if (reg[paso] && reg[`resp_${paso}`]) {
            if (!produccionPorEmpleado[reg[`resp_${paso}`]]) {
              produccionPorEmpleado[reg[`resp_${paso}`]] = { toma: 0, edicion: 0, impreso: 0, empaquetado: 0 };
            }
            produccionPorEmpleado[reg[`resp_${paso}`]][paso]++;
          }
        });
      });
      
      Object.entries(produccionPorEmpleado).forEach(([empleado, datos]) => {
        const totalTareas = datos.toma + datos.edicion + datos.impreso + datos.empaquetado;
        produccionData.push([
          empleado,
          datos.toma,
          datos.edicion,
          datos.impreso,
          datos.empaquetado,
          totalTareas
        ]);
      });
      
      const produccionSheet = XLSX.utils.aoa_to_sheet(produccionData);
      produccionSheet['!cols'] = [{wch:25}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:15}];
      XLSX.utils.book_append_sheet(workbook, produccionSheet, 'Producción por Empleado');
      
      // Descargar el archivo
      const fecha = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      XLSX.writeFile(workbook, `planilla_control_${fecha}.xlsx`);
      
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert('Error al exportar los datos a Excel');
    }
  };

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
          <p className="text-sm text-gray-400">Cargando planilla...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-3 sm:p-4 md:p-6 font-sans">
      <div className="w-full mx-auto space-y-4 sm:space-y-6">
        
        {/* Indicador de sincronización */}
        {(sincronizando || guardando) && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {guardando ? 'Guardando...' : 'Sincronizando...'}
          </div>
        )}

        {/* HEADER */}
        <header className="bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 sm:mb-6">
            <div>
              <nav className="mb-2">
                <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                  ← Volver al Dashboard
                </Link>
              </nav>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">Planilla de Control</h1>
              <p className="text-xs text-gray-400 mt-1">
                MÚLTIPLES INSTITUCIONES · {esAdmin ? 'Administrador' : 'Empleado'} · Tiempo real
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <input 
                  type="text" 
                  placeholder="Buscar cliente por nombre..." 
                  className="w-full border border-gray-200 px-4 py-2 text-sm focus:border-gray-400 outline-none pl-9"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
              </div>

              {/* Botón de Exportar a Excel */}
              <button 
                onClick={exportarAExcel}
                className="bg-green-600 text-white px-4 py-2 text-sm hover:bg-green-700 transition-colors whitespace-nowrap flex items-center gap-2"
              >
                📊 Exportar a Excel
              </button>

              {esAdmin && (
                <button 
                  onClick={() => setModalInstitucion(true)}
                  className="bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  + Nueva Institución
                </button>
              )}
            </div>
          </div>
          
          <div className="border-t border-gray-100 pt-4">
            <label className="text-xs text-gray-500 block mb-2">Institución activa:</label>
            <div className="flex flex-wrap gap-2">
              {instituciones.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => setInstitucionActiva(inst.id)}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border transition-colors ${
                    inst.id === institucionActiva
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {inst.nombre}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* DATOS INSTITUCIÓN */}
        {institucionActual && (
          <div className="bg-white border border-gray-200 p-4 sm:p-6 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div className="sm:col-span-2 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">Institución</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 outline-none bg-white" 
                  value={institucionActual.nombre || ''}
                  onChange={(e) => actualizarInstitucion(institucionActual.id, 'nombre', e.target.value)}
                  disabled={!esAdmin}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Director</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 outline-none bg-white" 
                  value={institucionActual.director || ''}
                  onChange={(e) => actualizarInstitucion(institucionActual.id, 'director', e.target.value)}
                  disabled={!esAdmin}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 outline-none bg-white" 
                  value={institucionActual.fecha || ''}
                  onChange={(e) => actualizarInstitucion(institucionActual.id, 'fecha', e.target.value)}
                  disabled={!esAdmin}
                />
              </div>
              {esAdmin && (
                <div className="flex items-end justify-end sm:col-span-2 md:col-span-1">
                  <button
                    onClick={() => eliminarInstitucion(institucionActual.id)}
                    className="text-red-500 hover:text-red-700 text-xs sm:text-sm border border-red-200 px-3 py-1.5 w-full sm:w-auto"
                    disabled={instituciones.length <= 1}
                  >
                    Eliminar Institución
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* GRUPOS */}
        {institucionActual && grupos.map((grupo) => {
          // Determinar qué registros mostrar (filtrados o todos)
          const registrosAMostrar = busqueda && registrosFiltradosPorGrupo?.[institucionActual.id]?.[grupo.id]
            ? registrosFiltradosPorGrupo[institucionActual.id][grupo.id]
            : grupo.registros;

          if (busqueda && (!registrosAMostrar || registrosAMostrar.length === 0)) return null;

          return (
            <section key={grupo.id} className="bg-white border border-gray-200 shadow-sm overflow-x-auto">
              
              <div className="bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row">
                <div className="p-3 sm:p-4 flex-1 border-b md:border-b-0 md:border-r border-gray-200">
                  <input 
                    className="bg-transparent font-medium text-sm sm:text-base w-full mb-2 outline-none" 
                    value={grupo.nombre || ''} 
                    onChange={(e) => actualizarGrupo(grupo.id, 'nombre', e.target.value.toUpperCase())}
                    disabled={!esAdmin}
                  />
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    {esAdmin && (
                      <>
                        <button onClick={() => agregarFila(grupo.id)} className="text-xs text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap">
                          + Agregar Cliente
                        </button>
                        <button onClick={() => eliminarGrupo(grupo.id)} className="text-xs text-red-500 hover:text-red-700 transition-colors whitespace-nowrap">
                          Eliminar Grupo
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 flex-1">
                  <label className="text-xs text-gray-500 block mb-1">Notas del Grupo:</label>
                  <textarea 
                    placeholder="Escribe aquí pendientes o notas..."
                    className="w-full bg-transparent resize-none text-xs sm:text-sm outline-none text-gray-600 placeholder:text-gray-300"
                    value={grupo.notas || ''}
                    onChange={(e) => actualizarGrupo(grupo.id, 'notas', e.target.value)}
                    rows={2}
                    disabled={!esAdmin}
                  />
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-xs sm:text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-800 text-white text-[10px] sm:text-xs">
                      <th className="p-2 sm:p-3 border-r border-gray-700 text-left font-medium">Cliente</th>
                      <th className="p-2 sm:p-3 border-r border-gray-700 bg-blue-900/80 font-medium" colSpan="6">Paquete</th>
                      <th className="p-2 sm:p-3 border-r border-gray-700 bg-amber-800/80 font-medium" colSpan="5">Extras</th>
                      <th className="p-2 sm:p-3 border-r border-gray-700 bg-emerald-800/80 font-medium" colSpan="3">Finanzas</th>
                      <th className="p-2 sm:p-3 text-center font-medium bg-purple-900/80">Producción</th>
                      <th className="p-2 sm:p-3 text-center font-medium bg-indigo-900/80">Estado</th>
                    </tr>
                    
                    <tr className="bg-gray-50 text-[9px] sm:text-xs text-gray-500 border-b border-gray-200">
                      <th className="p-2 border-r border-gray-200 font-medium">Nombre</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium">Paquete</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium">Tamaño</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium">Cant.</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium">Costo</th>
                      <th className="p-2 border-r border-gray-200 text-right font-medium">Subtotal</th>
                      <th className="p-2 border-r border-gray-200 text-left font-medium min-w-[150px]">Personalización</th>
                      <th className="p-2 border-r border-gray-200" colSpan="5">
                        <div className="grid grid-cols-[100px_50px_60px_80px_100px_30px] px-1 text-[8px] sm:text-[10px]">
                          <span>Tamaño</span>
                          <span className="text-center">Cant</span>
                          <span className="text-center">Precio</span>
                          <span className="text-right">Subtotal</span>
                          <span>Personalización</span>
                          <span></span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium">Total</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium text-blue-600">Anticipo</th>
                      <th className="p-2 border-r border-gray-200 text-center font-medium text-red-600">Saldo</th>
                      <th className="p-2 text-center font-medium">Producción</th>
                      <th className="p-2 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  
                  <tbody>
                    {registrosAMostrar?.map((reg) => {
                      const { granTotal, totalPaquetes, saldoPendiente } = calcularTotales(reg);
                      const mostrarPersonalizacionPaquete = reg.paquete === 'Otro';
                      const mostrarPersonalizacionTamano = reg.tamPaquete === 'Otro';

                      return (
                        <tr key={reg.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <td className="p-0 border-r border-gray-100">
                            <input 
                              type="text" 
                              placeholder="NOMBRE" 
                              className="w-full p-2 sm:p-3 bg-transparent outline-none text-xs sm:text-sm min-w-[150px]"
                              value={reg.cliente || ''} 
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'cliente', e.target.value)}
                              disabled={!esAdmin}
                            />
                          </td>

                          <td className="p-0 border-r border-gray-100 bg-blue-50/20 min-w-[150px]">
                            <select 
                              className="w-full p-2 sm:p-3 bg-transparent text-center text-xs outline-none border-0"
                              value={reg.paquete || ''}
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'paquete', e.target.value)}
                              disabled={!esAdmin}
                            >
                              <option value="">Seleccionar...</option>
                              {PAQUETES_OPCIONES.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-0 border-r border-gray-100 bg-blue-50/20 min-w-[120px]">
                            <select 
                              className="w-full p-2 sm:p-3 bg-transparent text-center text-xs outline-none border-0"
                              value={reg.tamPaquete || '5x7'}
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'tamPaquete', e.target.value)}
                              disabled={!esAdmin}
                            >
                              {TAMAÑOS_OPCIONES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>

                          <td className="p-0 border-r border-gray-100 min-w-[70px]">
                            <input 
                              type="number" 
                              className="w-full p-2 sm:p-3 text-center text-xs border-0 focus:ring-0" 
                              value={reg.cantPaquetes || 1} 
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'cantPaquetes', e.target.value)}
                              disabled={!esAdmin}
                            />
                          </td>

                          <td className="p-0 border-r border-gray-100 min-w-[80px]">
                            <input 
                              type="number" 
                              className="w-full p-2 sm:p-3 text-center text-xs border-0 focus:ring-0" 
                              value={reg.costoPaquete || 0} 
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'costoPaquete', e.target.value)}
                              disabled={!esAdmin}
                            />
                          </td>

                          <td className="p-2 sm:p-3 text-xs font-medium text-right border-r border-gray-100 min-w-[80px]">
                            ${totalPaquetes.toLocaleString()}
                          </td>

                          <td className="p-0 border-r border-gray-100 bg-yellow-50/30 min-w-[150px]">
                            {(mostrarPersonalizacionPaquete || mostrarPersonalizacionTamano) && (
                              <div className="flex flex-col gap-1 p-2">
                                {mostrarPersonalizacionPaquete && (
                                  <div>
                                    <label className="text-[8px] text-gray-500 block">Paquete personalizado:</label>
                                    <input 
                                      type="text"
                                      placeholder="Ej: Paquete Premium"
                                      className="w-full p-1 text-xs border border-gray-200 rounded bg-white outline-none focus:border-gray-400"
                                      value={reg.paquetePersonalizado || ''}
                                      onChange={(e) => actualizarFila(grupo.id, reg.id, 'paquetePersonalizado', e.target.value)}
                                      disabled={!esAdmin}
                                    />
                                  </div>
                                )}
                                {mostrarPersonalizacionTamano && (
                                  <div>
                                    <label className="text-[8px] text-gray-500 block">Tamaño personalizado:</label>
                                    <input 
                                      type="text"
                                      placeholder="Ej: 10x12"
                                      className="w-full p-1 text-xs border border-gray-200 rounded bg-white outline-none focus:border-gray-400"
                                      value={reg.tamPaquetePersonalizado || ''}
                                      onChange={(e) => actualizarFila(grupo.id, reg.id, 'tamPaquetePersonalizado', e.target.value)}
                                      disabled={!esAdmin}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="p-0 border-r border-gray-100 bg-amber-50/30 min-w-[350px]" colSpan="5">
                            <div className="flex flex-col">
                              {reg.extras?.map((extra) => {
                                const mostrarExtraPersonalizacion = extra.tam === 'Otro';
                                return (
                                  <div key={extra.id} className="flex flex-col border-b border-amber-100 last:border-0">
                                    <div className="grid grid-cols-[100px_50px_60px_80px_100px_30px] items-center p-1">
                                      <select 
                                        className="p-1 sm:p-2 bg-transparent text-[9px] sm:text-xs outline-none w-full" 
                                        value={extra.tam || '5x7'} 
                                        onChange={(e) => actualizarExtra(grupo.id, reg.id, extra.id, 'tam', e.target.value)}
                                        disabled={!esAdmin}
                                      >
                                        {TAMAÑOS_OPCIONES.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                      
                                      <input 
                                        type="number" 
                                        className="p-1 sm:p-2 bg-transparent text-center text-[9px] sm:text-xs outline-none" 
                                        value={extra.cant || 1} 
                                        onChange={(e) => actualizarExtra(grupo.id, reg.id, extra.id, 'cant', e.target.value)}
                                        disabled={!esAdmin}
                                      />
                                      <input 
                                        type="number" 
                                        className="p-1 sm:p-2 bg-transparent text-center text-[9px] sm:text-xs outline-none" 
                                        value={extra.precio || 0} 
                                        onChange={(e) => actualizarExtra(grupo.id, reg.id, extra.id, 'precio', e.target.value)}
                                        disabled={!esAdmin}
                                      />
                                      <div className="p-1 sm:p-2 text-right text-[9px] sm:text-xs font-medium text-amber-700">
                                        ${((extra.cant || 0) * (extra.precio || 0)).toLocaleString()}
                                      </div>
                                      
                                      <div className="px-1">
                                        {mostrarExtraPersonalizacion && (
                                          <input 
                                            type="text"
                                            placeholder="Tamaño personalizado"
                                            className="w-full p-1 text-[9px] border border-gray-200 rounded bg-white outline-none focus:border-gray-400"
                                            value={extra.tamPersonalizado || ''}
                                            onChange={(e) => actualizarExtra(grupo.id, reg.id, extra.id, 'tamPersonalizado', e.target.value)}
                                            disabled={!esAdmin}
                                          />
                                        )}
                                      </div>
                                      
                                      {esAdmin && (
                                        <button 
                                          onClick={() => eliminarExtra(grupo.id, reg.id, extra.id)} 
                                          className="text-gray-400 hover:text-red-500 text-[10px] sm:text-xs"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {esAdmin && (
                                <button 
                                  onClick={() => agregarExtra(grupo.id, reg.id)} 
                                  className="text-xs text-blue-600 hover:text-blue-800 p-2 text-left transition-colors"
                                >
                                  + Extra
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="p-2 sm:p-3 text-xs font-medium text-center border-r border-gray-100 bg-gray-50 min-w-[80px]">
                            ${granTotal.toLocaleString()}
                          </td>

                          <td className="p-0 border-r border-gray-100 min-w-[100px]">
                            <input 
                              type="number" 
                              className="w-full p-2 sm:p-3 text-center text-xs text-blue-600 font-medium border-0 focus:ring-0" 
                              value={reg.anticipo || 0} 
                              onChange={(e) => actualizarFila(grupo.id, reg.id, 'anticipo', e.target.value)}
                              disabled={!esAdmin}
                            />
                          </td>

                          <td className={`p-2 sm:p-3 text-xs font-medium text-center border-r border-gray-100 min-w-[100px] ${
                            saldoPendiente > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            ${saldoPendiente.toLocaleString()}
                          </td>

                          <td className="p-2 border-r border-gray-100 min-w-[280px]">
                            <div className="flex flex-col gap-1">
                              <div className="grid grid-cols-4 gap-1">
                                {[
                                  { key: 'toma', label: 'Toma', color: 'bg-blue-100 text-blue-700' },
                                  { key: 'edicion', label: 'Edición', color: 'bg-green-100 text-green-700' },
                                  { key: 'impreso', label: 'Impresión', color: 'bg-orange-100 text-orange-700' },
                                  { key: 'empaquetado', label: 'Empaque', color: 'bg-purple-100 text-purple-700' }
                                ].map((step) => (
                                  <div key={step.key} className="flex flex-col items-center">
                                    <button
                                      onClick={() => actualizarFila(grupo.id, reg.id, step.key, !reg[step.key])}
                                      className={`w-full py-1 text-[10px] font-medium border rounded transition-colors ${
                                        reg[step.key] 
                                          ? `${step.color} border-current` 
                                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400'
                                      }`}
                                    >
                                      {step.label}
                                    </button>
                                    {reg[step.key] && (
                                      <select 
                                        className="text-[8px] border-none bg-transparent text-gray-500 outline-none mt-0.5 w-full text-center"
                                        value={reg[`resp_${step.key}`] || ''}
                                        onChange={(e) => actualizarFila(grupo.id, reg.id, `resp_${step.key}`, e.target.value)}
                                        disabled={!esAdmin}
                                      >
                                        <option value="">--</option>
                                        {staff.map(member => (
                                          <option key={member.id} value={member.nombre}>
                                            {member.nombre?.split(' ')[0] || member.nombre}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>

                          <td className="p-2 min-w-[200px]">
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2 justify-center">
                                <button
                                  onClick={() => actualizarFila(grupo.id, reg.id, 'entregado', !reg.entregado)}
                                  className={`text-[10px] px-3 py-1 rounded transition-colors ${
                                    reg.entregado
                                      ? 'bg-green-600 text-white'
                                      : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                                  }`}
                                >
                                  Entregado
                                </button>
                                
                                <button
                                  onClick={() => actualizarFila(grupo.id, reg.id, 'pagadoCompleto', !reg.pagadoCompleto)}
                                  className={`text-[10px] px-3 py-1 rounded transition-colors ${
                                    reg.pagadoCompleto
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'
                                  }`}
                                >
                                  {reg.pagadoCompleto ? 'Pagado' : 'Pendiente'}
                                </button>
                              </div>
                              
                              {esAdmin && (
                                <div className="flex justify-center">
                                  <button
                                    onClick={() => eliminarFila(grupo.id, reg.id)}
                                    className="text-gray-400 hover:text-red-500 text-xs"
                                    title="Eliminar cliente"
                                  >
                                    🗑️ Eliminar
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {/* BOTÓN AGREGAR GRUPO */}
        {institucionActual && esAdmin && (
          <div className="flex justify-center">
            <button 
              onClick={agregarGrupo} 
              className="bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + Agregar Nuevo Grupo a {institucionActual.nombre}
            </button>
          </div>
        )}

        {/* FOOTER TOTALES GLOBALES */}
        <footer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 bg-white border border-gray-200 shadow-sm sticky bottom-4">
          <div>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Proyectado</p>
            <p className="text-lg sm:text-xl md:text-2xl font-light text-gray-900 break-words">
              ${totalGlobal.toLocaleString()}
            </p>
          </div>
          
          <div>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Anticipos Globales</p>
            <p className="text-lg sm:text-xl md:text-2xl font-light text-blue-600 break-words">
              ${totalAnticipos.toLocaleString()}
            </p>
          </div>
          
          <div>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Cuentas por Cobrar</p>
            <p className="text-lg sm:text-xl md:text-2xl font-light text-red-600 break-words">
              ${totalSaldo.toLocaleString()}
            </p>
          </div>
          
          <div className="sm:col-span-2 md:col-span-1 md:border-l border-gray-200 md:pl-4">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Eficiencia Global</p>
            <p className="text-lg sm:text-xl md:text-2xl font-light">
              {todosLosRegistros.length > 0 
                ? Math.round((totalEntregados / todosLosRegistros.length) * 100)
                : 0}%
              <span className="text-[8px] sm:text-xs text-gray-400 ml-2">entregado</span>
            </p>
          </div>
        </footer>

        {/* SECCIÓN TOTALES POR INSTITUCIÓN */}
        <div className="bg-white border border-gray-200 shadow-sm">
          <button
            onClick={() => setMostrarTotalesInstituciones(!mostrarTotalesInstituciones)}
            className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
          >
            <h2 className="text-sm font-medium text-gray-700">📊 Totales por Institución</h2>
            <span className="text-gray-400 text-sm">{mostrarTotalesInstituciones ? '▼' : '▶'}</span>
          </button>
          
          {mostrarTotalesInstituciones && (
            <div className="overflow-x-auto border-t border-gray-200">
              <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                <thead className="bg-gray-50">
                  <tr className="text-gray-600">
                    <th className="p-3 text-left font-medium">Institución</th>
                    <th className="p-3 text-right font-medium">Total Proyectado</th>
                    <th className="p-3 text-right font-medium">Anticipos</th>
                    <th className="p-3 text-right font-medium">Saldo Pendiente</th>
                    <th className="p-3 text-right font-medium">Clientes</th>
                    <th className="p-3 text-right font-medium">Entregados</th>
                    <th className="p-3 text-right font-medium">Eficiencia</th>
                   </tr>
                </thead>
                <tbody>
                  {totalesPorInstitucion.map((inst) => (
                    <tr key={inst.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{inst.nombre}</td>
                      <td className="p-3 text-right font-medium text-gray-900">${inst.total.toLocaleString()}</td>
                      <td className="p-3 text-right text-blue-600">${inst.anticipos.toLocaleString()}</td>
                      <td className="p-3 text-right text-red-600">${inst.saldo.toLocaleString()}</td>
                      <td className="p-3 text-right text-gray-600">{inst.totalClientes}</td>
                      <td className="p-3 text-right text-green-600">{inst.entregados}</td>
                      <td className="p-3 text-right font-medium">
                        {inst.totalClientes > 0 
                          ? Math.round((inst.entregados / inst.totalClientes) * 100)
                          : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr className="font-medium">
                    <td className="p-3 text-gray-700">TOTALES</td>
                    <td className="p-3 text-right text-gray-900">${totalGlobal.toLocaleString()}</td>
                    <td className="p-3 text-right text-blue-600">${totalAnticipos.toLocaleString()}</td>
                    <td className="p-3 text-right text-red-600">${totalSaldo.toLocaleString()}</td>
                    <td className="p-3 text-right">{todosLosRegistros.length}</td>
                    <td className="p-3 text-right">{totalEntregados}</td>
                    <td className="p-3 text-right">
                      {todosLosRegistros.length > 0 
                        ? Math.round((totalEntregados / todosLosRegistros.length) * 100)
                        : 0}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* SECCIÓN TOTALES POR GRUPO */}
        {institucionActual && totalesPorGrupo.length > 0 && (
          <div className="bg-white border border-gray-200 shadow-sm">
            <button
              onClick={() => setMostrarTotalesGrupos(!mostrarTotalesGrupos)}
              className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-sm font-medium text-gray-700">📋 Totales por Grupo - {institucionActual.nombre}</h2>
              <span className="text-gray-400 text-sm">{mostrarTotalesGrupos ? '▼' : '▶'}</span>
            </button>
            
            {mostrarTotalesGrupos && (
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                  <thead className="bg-gray-50">
                    <tr className="text-gray-600">
                      <th className="p-3 text-left font-medium">Grupo</th>
                      <th className="p-3 text-right font-medium">Total Proyectado</th>
                      <th className="p-3 text-right font-medium">Anticipos</th>
                      <th className="p-3 text-right font-medium">Saldo Pendiente</th>
                      <th className="p-3 text-right font-medium">Clientes</th>
                      <th className="p-3 text-right font-medium">Entregados</th>
                      <th className="p-3 text-right font-medium">Eficiencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalesPorGrupo.map((grupo) => (
                      <tr key={grupo.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">{grupo.nombre}</td>
                        <td className="p-3 text-right font-medium text-gray-900">${grupo.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-blue-600">${grupo.anticipos.toLocaleString()}</td>
                        <td className="p-3 text-right text-red-600">${grupo.saldo.toLocaleString()}</td>
                        <td className="p-3 text-right text-gray-600">{grupo.totalClientes}</td>
                        <td className="p-3 text-right text-green-600">{grupo.entregados}</td>
                        <td className="p-3 text-right font-medium">
                          {grupo.totalClientes > 0 
                            ? Math.round((grupo.entregados / grupo.totalClientes) * 100)
                            : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr className="font-medium">
                      <td className="p-3 text-gray-700">TOTAL {institucionActual.nombre}</td>
                      <td className="p-3 text-right text-gray-900">
                        ${totalesPorGrupo.reduce((sum, g) => sum + g.total, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-blue-600">
                        ${totalesPorGrupo.reduce((sum, g) => sum + g.anticipos, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-red-600">
                        ${totalesPorGrupo.reduce((sum, g) => sum + g.saldo, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {totalesPorGrupo.reduce((sum, g) => sum + g.totalClientes, 0)}
                      </td>
                      <td className="p-3 text-right">
                        {totalesPorGrupo.reduce((sum, g) => sum + g.entregados, 0)}
                      </td>
                      <td className="p-3 text-right">
                        {(() => {
                          const totalClientes = totalesPorGrupo.reduce((sum, g) => sum + g.totalClientes, 0);
                          const totalEntregadosGrupo = totalesPorGrupo.reduce((sum, g) => sum + g.entregados, 0);
                          return totalClientes > 0 ? Math.round((totalEntregadosGrupo / totalClientes) * 100) : 0;
                        })()}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL INSTITUCIÓN */}
        {modalInstitucion && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white max-w-md w-full p-4 sm:p-6">
              <h3 className="text-sm font-medium mb-4">Nueva Institución</h3>
              <form onSubmit={agregarInstitucion} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Nombre de la Institución *</label>
                  <input 
                    type="text" 
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={nuevaInstitucion.nombre}
                    onChange={(e) => setNuevaInstitucion({...nuevaInstitucion, nombre: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Director</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={nuevaInstitucion.director}
                    onChange={(e) => setNuevaInstitucion({...nuevaInstitucion, director: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha</label>
                  <input 
                    type="date" 
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={nuevaInstitucion.fecha}
                    onChange={(e) => setNuevaInstitucion({...nuevaInstitucion, fecha: e.target.value})}
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button 
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 text-sm hover:bg-blue-700"
                  >
                    Crear Institución
                  </button>
                  <button 
                    type="button"
                    onClick={() => setModalInstitucion(false)}
                    className="flex-1 border border-gray-200 py-2 text-sm hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
}

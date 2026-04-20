// app/paquetes/page.js (VERSIÓN CON BOTÓN DE CERRAR SESIÓN)
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';

export default function Paquetes() {
  const router = useRouter();
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
  } = useFirebase();
  
  const [paso, setPaso] = useState(1);
  const [paquetes, setPaquetes] = useState([]);
  const [cliente, setCliente] = useState({ nombre: '', email: '', telefono: '', direccion: '' });
  const [seleccionado, setSeleccionado] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  
  const categorias = ["SOCIAL", "CORPORATIVO", "ESCOLARES", "IMPRESIÓN"];
  const esAdmin = usuario?.rol === 'admin';
  const isMounted = useRef(true);
  const paquetesInicializadosRef = useRef(false);

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

  // --- PAQUETES POR DEFECTO ---
  const paquetesPorDefecto = [
    { 
      id: "pkg_social_basico", 
      categoria: "SOCIAL", 
      nombre: "Básico XV", 
      precio: 1500, 
      incluye: ["10 fotos digitales", "Retoque básico", "Entrega en 5 días"], 
      img: "" 
    },
    { 
      id: "pkg_corporativo_linkedin", 
      categoria: "CORPORATIVO", 
      nombre: "Retrato LinkedIn", 
      precio: 2000, 
      incluye: ["2 looks", "Retoque profesional", "Entrega en 24 horas"], 
      img: "" 
    },
    { 
      id: "pkg_escolares_basico", 
      categoria: "ESCOLARES", 
      nombre: "Foto Infantil", 
      precio: 800, 
      incluye: ["5 fotos digitales", "Fondo neutro", "Entrega en 3 días"], 
      img: "" 
    },
    { 
      id: "pkg_impresion_foto", 
      categoria: "IMPRESIÓN", 
      nombre: "Impresión Lámina", 
      precio: 300, 
      incluye: ["Papel mate", "Tamaño 8x10", "Acabado profesional"], 
      img: "" 
    }
  ];

  // --- FUNCIÓN PARA INICIALIZAR PAQUETES EN FIREBASE (SOLO UNA VEZ) ---
  const inicializarPaquetes = useCallback(async () => {
    if (!usuario || !esAdmin) return;
    if (paquetesInicializadosRef.current) return;
    
    paquetesInicializadosRef.current = true;
    
    try {
      for (const pkg of paquetesPorDefecto) {
        const existe = await leerTodos(COLLECTIONS.PAQUETES, {
          campo: 'id', operador: '==', valor: pkg.id
        });
        if (!existe || existe.length === 0) {
          await crear(COLLECTIONS.PAQUETES, {
            ...pkg,
            creadoEn: new Date().toISOString(),
            creadoPor: usuario.nombre
          }, pkg.id);
        }
      }
    } catch (error) {
      console.error('Error inicializando paquetes:', error);
      paquetesInicializadosRef.current = false;
    }
  }, [usuario, esAdmin, leerTodos, crear]);

  // --- SUSCRIPCIÓN EN TIEMPO REAL A PAQUETES ---
  useEffect(() => {
    if (!usuario) return;
    
    setSincronizando(true);
    setErrorCarga(null);
    
    const unsubscribe = suscribir(COLLECTIONS.PAQUETES, async (data) => {
      if (isMounted.current) {
        if (data && data.length > 0) {
          setPaquetes(data);
        } else if (!paquetesInicializadosRef.current) {
          await inicializarPaquetes();
          const nuevosPaquetes = await leerTodos(COLLECTIONS.PAQUETES);
          if (nuevosPaquetes && nuevosPaquetes.length > 0) {
            setPaquetes(nuevosPaquetes);
          } else {
            setPaquetes(paquetesPorDefecto);
          }
        }
        setCargado(true);
        setSincronizando(false);
      }
    }, (error) => {
      console.error('Error en suscripción:', error);
      setErrorCarga('Error al cargar los paquetes');
      setSincronizando(false);
    });
    
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [usuario, suscribir, inicializarPaquetes, leerTodos]);

  // --- GUARDAR CAMBIOS EN FIREBASE (CORREGIDO) ---
  const guardarCambios = useCallback(async (nuevaLista) => {
    if (!usuario || !esAdmin) return;
    if (guardando) return;
    
    setGuardando(true);
    setPaquetes(nuevaLista);
    
    try {
      const existingDocs = await leerTodos(COLLECTIONS.PAQUETES);
      const existingMap = new Map(existingDocs.map(doc => [doc.id, doc]));
      
      for (const pkg of nuevaLista) {
        if (existingMap.has(pkg.id)) {
          await actualizar(COLLECTIONS.PAQUETES, pkg.id, {
            nombre: pkg.nombre,
            precio: pkg.precio,
            incluye: pkg.incluye,
            categoria: pkg.categoria,
            actualizadoEn: new Date().toISOString(),
            actualizadoPor: usuario.nombre
          });
          existingMap.delete(pkg.id);
        } else {
          await crear(COLLECTIONS.PAQUETES, {
            ...pkg,
            creadoEn: new Date().toISOString(),
            creadoPor: usuario.nombre
          }, pkg.id);
        }
      }
      
      for (const [id] of existingMap) {
        const pkgAEliminar = nuevaLista.find(p => p.id === id);
        if (pkgAEliminar?.img && pkgAEliminar.img.startsWith('https://firebasestorage.googleapis.com')) {
          try {
            const imageRef = ref(storage, pkgAEliminar.img);
            await deleteObject(imageRef);
          } catch (e) {
            console.error('Error eliminando imagen:', e);
          }
        }
        await eliminar(COLLECTIONS.PAQUETES, id);
      }
    } catch (error) {
      console.error('Error guardando paquetes:', error);
      alert('Error al guardar cambios. Intenta nuevamente.');
      const datosOriginales = await leerTodos(COLLECTIONS.PAQUETES);
      if (datosOriginales) setPaquetes(datosOriginales);
    } finally {
      setGuardando(false);
    }
  }, [usuario, esAdmin, guardando, leerTodos, actualizar, crear, eliminar]);

  // --- SUBIR IMAGEN A FIREBASE STORAGE ---
  const handleImageUpload = async (id, file) => {
    if (!file || !esAdmin) return;
    
    setGuardando(true);
    
    try {
      const paqueteActual = paquetes.find(p => p.id === id);
      
      if (paqueteActual?.img && paqueteActual.img.startsWith('https://firebasestorage.googleapis.com')) {
        try {
          const oldImageRef = ref(storage, paqueteActual.img);
          await deleteObject(oldImageRef);
        } catch (e) {
          console.error('Error eliminando imagen anterior:', e);
        }
      }
      
      const fileName = `paquetes/${id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);
      
      const nueva = paquetes.map(p => 
        p.id === id ? { ...p, img: imageUrl } : p
      );
      await guardarCambios(nueva);
      
    } catch (error) {
      console.error('Error subiendo imagen:', error);
      alert('Error al subir la imagen');
    } finally {
      setGuardando(false);
    }
  };

  // --- ACTUALIZAR PAQUETE ---
  const actualizarPaquete = (id, campo, valor) => {
    const nueva = paquetes.map(p => {
      if (p.id === id) {
        if (campo === 'incluye' && typeof valor === 'string') {
          return { ...p, incluye: valor.split(',').map(i => i.trim()) };
        }
        return { ...p, [campo]: campo === 'precio' ? Number(valor) : valor };
      }
      return p;
    });
    guardarCambios(nueva);
  };

  // --- AGREGAR BENEFICIO ---
  const agregarBeneficio = (paqueteId) => {
    const nueva = paquetes.map(p => {
      if (p.id === paqueteId) {
        return { ...p, incluye: [...p.incluye, "Nuevo beneficio"] };
      }
      return p;
    });
    guardarCambios(nueva);
  };

  // --- ACTUALIZAR BENEFICIO ---
  const actualizarBeneficio = (paqueteId, index, valor) => {
    const nueva = paquetes.map(p => {
      if (p.id === paqueteId) {
        const nuevosIncluye = [...p.incluye];
        nuevosIncluye[index] = valor;
        return { ...p, incluye: nuevosIncluye };
      }
      return p;
    });
    guardarCambios(nueva);
  };

  // --- ELIMINAR BENEFICIO ---
  const eliminarBeneficio = (paqueteId, index) => {
    if (confirm("¿Eliminar este beneficio?")) {
      const nueva = paquetes.map(p => {
        if (p.id === paqueteId) {
          const nuevosIncluye = p.incluye.filter((_, i) => i !== index);
          return { ...p, incluye: nuevosIncluye };
        }
        return p;
      });
      guardarCambios(nueva);
    }
  };

  // --- AGREGAR PAQUETE ---
  const agregarPaquete = (cat) => {
    if (!esAdmin) return;
    
    const nuevo = {
      id: `pkg_${Date.now()}`,
      categoria: cat,
      nombre: "NUEVO SERVICIO",
      precio: 0,
      incluye: ["Beneficio 1", "Beneficio 2", "Beneficio 3"],
      img: ""
    };
    guardarCambios([...paquetes, nuevo]);
  };

  // --- ELIMINAR PAQUETE ---
  const eliminarPaquete = (id) => {
    if (!esAdmin) return;
    
    if (confirm("⚠️ ¿Estás seguro de eliminar este paquete permanentemente?\n\nEsta acción no se puede deshacer.")) {
      guardarCambios(paquetes.filter(p => p.id !== id));
    }
  };

  // --- VALIDAR CLIENTE ---
  const validarCliente = () => {
    const errores = [];
    
    if (!cliente.nombre?.trim()) {
      errores.push('El nombre es requerido');
    } else if (cliente.nombre.length < 3) {
      errores.push('El nombre debe tener al menos 3 caracteres');
    }
    
    if (!cliente.email?.trim()) {
      errores.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
      errores.push('Email inválido');
    }
    
    if (!cliente.telefono?.trim()) {
      errores.push('El teléfono es requerido');
    } else if (!/^\d{10,15}$/.test(cliente.telefono.replace(/\D/g, ''))) {
      errores.push('Teléfono inválido (10-15 dígitos)');
    }
    
    if (!cliente.direccion?.trim()) {
      errores.push('La dirección es requerida');
    }
    
    if (errores.length > 0) {
      alert(errores.join('\n'));
      return false;
    }
    
    return true;
  };

  // --- SCROLL A CATEGORÍA ---
  const scrollToCat = async (cat) => {
    setPaso(1);
    await new Promise(resolve => setTimeout(resolve, 100));
    const el = document.getElementById(`cat-${cat}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      setTimeout(() => {
        const retryEl = document.getElementById(`cat-${cat}`);
        if (retryEl) retryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  };

  // --- GENERAR NÚMERO DE TICKET ÚNICO ---
  const generarNumeroTicket = () => {
    const fecha = new Date();
    const año = fecha.getFullYear().toString().slice(-2);
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const dia = fecha.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TK-${año}${mes}${dia}-${random}`;
  };

  // --- ENVIAR A ACREDITACIÓN ---
  const finalizarComprayRegistrar = async () => {
    if (!validarCliente()) return;
    
    setGuardando(true);
    
    try {
      const numeroTicket = generarNumeroTicket();
      
      const nuevosDatos = {
        ticket: numeroTicket,
        nombre: cliente.nombre,
        email: cliente.email,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        paqueteId: seleccionado?.id,
        paqueteNombre: seleccionado?.nombre,
        paquetePrecio: seleccionado?.precio,
        paqueteCategoria: seleccionado?.categoria,
        paqueteIncluye: seleccionado?.incluye || [],
        monto: seleccionado?.precio || 0,
        categoria: seleccionado?.categoria,
        fechaRegistro: new Date().toISOString(),
        fechaHora: new Date().toISOString(),
        metodoPago: "Por definir",
        checkIn: false,
        registradoPor: usuario?.nombre || 'Sistema',
        registradoPorId: usuario?.id
      };

      await crear(COLLECTIONS.CLIENTES, nuevosDatos);
      
      setPaso(1); 
      setCliente({ nombre: '', email: '', telefono: '', direccion: '' }); 
      setSeleccionado(null);
      
      alert(`¡Registro exitoso! Ticket #${numeroTicket} generado. Pasa al área de acreditación.`);
    } catch (error) {
      console.error('Error registrando cliente:', error);
      alert('Error al registrar el cliente. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  // Protección de ruta
  useEffect(() => {
    if (!authCargando && !usuario) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // Mostrar información de depuración
  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Cargando catálogo...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-8 font-light">
      
      {/* Panel de depuración (solo visible para admin) */}
      {esAdmin && (
        <div className="fixed top-4 left-4 z-50 bg-yellow-100 border border-yellow-400 px-3 py-1 rounded text-xs shadow-lg">
          <span className="font-bold">Admin mode:</span> Activo | 
          <button 
            onClick={() => setPaso(paso === 4 ? 1 : 4)} 
            className="ml-2 underline hover:text-blue-600"
          >
            {paso === 4 ? 'Ver catálogo' : 'Ir a editor'}
          </button>
        </div>
      )}
      
      {/* Indicadores de estado */}
      {(sincronizando || guardando) && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
          {guardando ? 'Guardando...' : 'Sincronizando...'}
        </div>
      )}
      
      {/* NAVBAR */}
      <nav className="sticky top-2 sm:top-4 z-40 bg-white border border-gray-200 p-2 sm:p-3 flex flex-wrap justify-between items-center mb-8 sm:mb-12 gap-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar py-1 flex-1">
          {categorias.map(cat => (
            <button 
              key={cat} 
              onClick={() => scrollToCat(cat)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors shrink-0 whitespace-nowrap"
            >
              {cat}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Botón de Configurar - siempre visible para admin */}
          {esAdmin && (
            <button 
              onClick={() => setPaso(paso === 4 ? 1 : 4)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs border transition-colors whitespace-nowrap ${
                paso === 4 
                  ? 'border-gray-900 bg-gray-900 text-white' 
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {paso === 4 ? "Ver catálogo" : "✏️ Editar paquetes"}
            </button>
          )}
          
          {/* 🔴 NUEVO: Botón de cerrar sesión */}
          <button
            onClick={handleLogout}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors whitespace-nowrap"
          >
            🚪 Cerrar sesión
          </button>
        </div>
        
        {/* Indicador de rol para depuración */}
        <div className="text-[8px] text-gray-400 hidden sm:block">
          {esAdmin ? '👑 Admin' : '👤 Cliente'}
        </div>
      </nav>

      {/* Mostrar mensaje de error si hay */}
      {errorCarga && (
        <div className="max-w-7xl mx-auto mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs">
          {errorCarga}
        </div>
      )}

      {/* Mostrar estado de paquetes cargados */}
      {paquetes.length === 0 && (
        <div className="max-w-7xl mx-auto mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-600 text-xs">
          No hay paquetes cargados. {esAdmin && 'Haz clic en "Editar paquetes" para agregar servicios.'}
        </div>
      )}

      {/* VISTA 1: CATÁLOGO */}
      {paso === 1 && (
        <div className="max-w-7xl mx-auto space-y-12 sm:space-y-16">
          {categorias.map(cat => (
            <section key={cat} id={`cat-${cat}`} className="scroll-mt-24">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-light tracking-tight">{cat}</h2>
                <div className="w-10 sm:w-12 h-px bg-gray-200 mt-2"></div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {paquetes.filter(p => p.categoria === cat).map(pkg => (
                  <div key={pkg.id} className="border border-gray-200 bg-white hover:border-gray-400 transition-colors flex flex-col">
                    <div className="aspect-[4/3] bg-gray-50 border-b border-gray-200 relative overflow-hidden">
                      {pkg.img ? (
                        <img src={pkg.img} className="w-full h-full object-cover" alt={pkg.nombre} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">
                          Sin imagen
                        </div>
                      )}
                      <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 bg-white border border-gray-200 px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
                        ${pkg.precio}
                      </div>
                    </div>
                    
                    <div className="p-4 sm:p-5 flex-1 flex flex-col">
                      <div>
                        <h3 className="text-base sm:text-lg font-medium mb-2 sm:mb-3 break-words">{pkg.nombre}</h3>
                        <ul className="space-y-1 sm:space-y-2 mb-3 sm:mb-5">
                          {pkg.incluye.map((line, i) => (
                            <li key={i} className="text-[10px] sm:text-xs text-gray-500 flex items-start gap-1">
                              <span className="w-1 h-1 bg-gray-400 mt-1 mr-1 flex-shrink-0"></span> 
                              <span className="break-words">{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <button 
                        onClick={() => { setSeleccionado(pkg); setPaso(2); }}
                        className="w-full border border-gray-200 py-2 sm:py-3 text-[10px] sm:text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors mt-auto"
                      >
                        Seleccionar servicio
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* VISTA 2: REGISTRO CLIENTE */}
      {paso === 2 && seleccionado && (
        <div className="max-w-md mx-auto border border-gray-200 p-4 sm:p-8 bg-white animate-in fade-in duration-300 mx-4 sm:mx-auto">
          <button 
            onClick={() => setPaso(1)} 
            className="text-xs text-gray-400 hover:text-gray-900 mb-4 sm:mb-6 transition-colors"
          >
            ← Volver al catálogo
          </button>
          
          <div className="flex flex-col xs:flex-row gap-4 mb-6 sm:mb-8 p-3 sm:p-4 bg-gray-50 border border-gray-200">
            <div className="w-16 h-16 bg-gray-100 shrink-0 overflow-hidden border border-gray-200 mx-auto xs:mx-0">
              {seleccionado.img && <img src={seleccionado.img} className="w-full h-full object-cover" />}
            </div>
            <div className="text-center xs:text-left">
              <p className="text-xs text-gray-500 mb-1">Resumen:</p>
              <h3 className="text-base font-medium break-words">{seleccionado.nombre}</h3>
              <p className="text-sm text-gray-900">${seleccionado.precio}</p>
              <p className="text-xs text-gray-500 mt-1">{seleccionado.categoria}</p>
            </div>
          </div>
          
          <form className="space-y-3 sm:space-y-4" onSubmit={(e) => { e.preventDefault(); setPaso(3); }}>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre completo</label>
              <input 
                required 
                className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                value={cliente.nombre}
                onChange={(e) => setCliente({...cliente, nombre: e.target.value})} 
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input 
                required 
                type="email"
                className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                value={cliente.email}
                onChange={(e) => setCliente({...cliente, email: e.target.value})} 
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">WhatsApp / Celular</label>
              <input 
                required 
                type="tel"
                className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                value={cliente.telefono}
                onChange={(e) => setCliente({...cliente, telefono: e.target.value})} 
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dirección</label>
              <input 
                required 
                className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                value={cliente.direccion}
                onChange={(e) => setCliente({...cliente, direccion: e.target.value})} 
              />
            </div>
            
            <button 
              type="submit"
              disabled={guardando}
              className="w-full bg-gray-900 text-white text-sm py-2 sm:py-3 hover:bg-gray-800 transition-colors mt-2 sm:mt-4 disabled:opacity-50"
            >
              Generar ticket
            </button>
          </form>
        </div>
      )}

      {/* VISTA 3: TICKET DE COMPRA */}
      {paso === 3 && (
        <div className="max-w-md mx-auto animate-in fade-in duration-300 px-4 sm:px-0">
          <div className="bg-white border-2 border-gray-900 p-4 sm:p-6 font-mono text-xs sm:text-sm relative">
            <div className="absolute -top-2 left-0 right-0 flex justify-center">
              <div className="bg-white px-2 text-[7px] sm:text-[8px] text-gray-400">······ CORTE AQUÍ ······</div>
            </div>
            
            <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 sm:pb-4 mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">EVR PRO STUDIO</h2>
              <p className="text-[8px] sm:text-[10px] text-gray-500">TICKET DE COMPRA</p>
              <p className="text-[7px] sm:text-[8px] text-gray-400 mt-1">{new Date().toLocaleString()}</p>
            </div>

            <div className="bg-gray-100 p-1.5 sm:p-2 text-center mb-3 sm:mb-4">
              <span className="text-[8px] sm:text-[10px] text-gray-500">TICKET #</span>
              <p className="text-xs sm:text-sm font-bold break-all">{generarNumeroTicket()}</p>
            </div>

            <div className="space-y-1 mb-3 sm:mb-4 text-[10px] sm:text-[11px]">
              <div className="flex flex-col xs:flex-row xs:justify-between gap-1 xs:gap-0">
                <span className="text-gray-500">CLIENTE:</span>
                <span className="font-medium break-words">{cliente.nombre}</span>
              </div>
              <div className="flex flex-col xs:flex-row xs:justify-between gap-1 xs:gap-0">
                <span className="text-gray-500">EMAIL:</span>
                <span className="break-words">{cliente.email}</span>
              </div>
              <div className="flex flex-col xs:flex-row xs:justify-between gap-1 xs:gap-0">
                <span className="text-gray-500">TEL:</span>
                <span>{cliente.telefono}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-3 sm:pt-4 mb-3 sm:mb-4">
              <div className="flex flex-col xs:flex-row xs:justify-between xs:items-start gap-2 xs:gap-0 mb-2">
                <span className="text-xs sm:text-xs font-bold break-words">{seleccionado?.nombre}</span>
                <span className="text-xs sm:text-sm font-bold">${seleccionado?.precio}</span>
              </div>
              
              <div className="text-[8px] sm:text-[9px] text-gray-500 space-y-0.5 pl-2">
                {seleccionado?.incluye.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1">
                    <span>•</span>
                    <span className="break-words">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center my-3 sm:my-4">
              <div className="border border-gray-200 p-2 sm:p-3 bg-white">
                <QRCodeSVG 
                  value={JSON.stringify({ 
                    ticket: generarNumeroTicket(),
                    cliente: cliente.nombre,
                    email: cliente.email,
                    paquete: seleccionado?.nombre,
                    precio: seleccionado?.precio,
                    fecha: new Date().toLocaleString()
                  })} 
                  size={typeof window !== 'undefined' && window.innerWidth < 640 ? 120 : 140} 
                />
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-300 pt-3 sm:pt-4 mt-2">
              <div className="flex flex-col xs:flex-row xs:justify-between text-sm sm:text-base font-bold mb-2 gap-1 xs:gap-0">
                <span>TOTAL</span>
                <span>${seleccionado?.precio}</span>
              </div>
              <div className="flex flex-col xs:flex-row xs:justify-between text-[8px] sm:text-[9px] text-gray-400 gap-1 xs:gap-0">
                <span>MÉTODO DE PAGO</span>
                <span>POR DEFINIR</span>
              </div>
            </div>

            <div className="text-center mt-4 sm:mt-6 text-[7px] sm:text-[8px] text-gray-400 border-t border-dashed border-gray-200 pt-3 sm:pt-4">
              <p>Este ticket es comprobante de pago</p>
              <p>Presentar en área de acreditación</p>
              <p className="mt-1 sm:mt-2">¡Gracias por tu compra!</p>
            </div>
          </div>

          <div className="mt-4 sm:mt-6 flex flex-col gap-2">
            <button 
              onClick={finalizarComprayRegistrar} 
              disabled={guardando}
              className="w-full bg-gray-900 text-white py-2 sm:py-3 text-xs sm:text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {guardando ? 'Procesando...' : 'Confirmar y enviar a acreditación'}
            </button>
            <button 
              onClick={() => window.print()}
              className="w-full border border-gray-200 py-2 sm:py-3 text-xs sm:text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              Imprimir ticket
            </button>
          </div>
        </div>
      )}

      {/* VISTA 4: EDITOR - Solo admin */}
      {paso === 4 && esAdmin && (
        <div className="max-w-6xl mx-auto space-y-8 sm:space-y-12 animate-in fade-in duration-300">
          <div className="border-b border-gray-200 pb-4 sm:pb-6">
            <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-2">✏️ Editor de catálogo</h2>
            <p className="text-xs sm:text-sm text-gray-500">Modifica precios, textos e imágenes de los paquetes</p>
            <p className="text-[10px] text-blue-500 mt-1">✓ Los cambios se guardan automáticamente</p>
          </div>
          
          {categorias.map(cat => {
            const paquetesCat = paquetes.filter(p => p.categoria === cat);
            return (
              <div key={cat} className="space-y-3 sm:space-y-4">
                <div className="flex flex-wrap justify-between items-center border-b border-gray-100 pb-2 gap-2">
                  <h3 className="text-base sm:text-lg font-medium">{cat}</h3>
                  <button 
                    onClick={() => agregarPaquete(cat)} 
                    className="text-[10px] sm:text-xs bg-gray-900 text-white px-2 sm:px-3 py-1 hover:bg-gray-800 transition-colors whitespace-nowrap"
                    disabled={guardando}
                  >
                    + Nuevo paquete
                  </button>
                </div>
                
                {paquetesCat.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-gray-200">
                    <p className="text-xs text-gray-400">No hay paquetes en esta categoría</p>
                    <button 
                      onClick={() => agregarPaquete(cat)} 
                      className="mt-2 text-xs text-blue-500 hover:text-blue-700"
                    >
                      + Crear primer paquete
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:gap-4">
                    {paquetesCat.map(pkg => (
                      <div key={pkg.id} className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-5 border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                        
                        <div className="lg:col-span-2">
                          <div className="aspect-square border border-gray-200 bg-gray-50 overflow-hidden relative group max-w-[200px] mx-auto lg:mx-0">
                            {pkg.img && <img src={pkg.img} className="w-full h-full object-cover" alt={pkg.nombre} />}
                            <label className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity border border-gray-200 text-center p-2">
                              <span className="text-[10px] sm:text-xs text-gray-600">
                                {guardando ? 'Subiendo...' : '📷 Subir imagen'}
                              </span>
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*" 
                                onChange={(e) => handleImageUpload(pkg.id, e.target.files[0])}
                                disabled={guardando}
                              />
                            </label>
                          </div>
                        </div>
                        
                        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                          <div className="col-span-1">
                            <label className="text-[10px] sm:text-xs text-gray-500 block mb-1">Nombre del paquete</label>
                            <input 
                              className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none" 
                              value={pkg.nombre} 
                              onChange={(e) => actualizarPaquete(pkg.id, 'nombre', e.target.value)} 
                              placeholder="Ej: Paquete Básico"
                              disabled={guardando}
                            />
                          </div>
                          
                          <div className="col-span-1">
                            <label className="text-[10px] sm:text-xs text-gray-500 block mb-1">Precio ($)</label>
                            <input 
                              type="number" 
                              className="w-full border border-gray-200 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none" 
                              value={pkg.precio} 
                              onChange={(e) => actualizarPaquete(pkg.id, 'precio', e.target.value)} 
                              placeholder="0"
                              disabled={guardando}
                            />
                          </div>
                          
                          <div className="col-span-1 md:col-span-2">
                            <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                              <label className="text-[10px] sm:text-xs text-gray-500">
                                Beneficios del paquete
                                <span className="text-[8px] sm:text-[9px] text-gray-400 ml-2">Cada punto es una viñeta</span>
                              </label>
                              <button
                                onClick={() => agregarBeneficio(pkg.id)}
                                className="text-[10px] sm:text-xs bg-gray-100 text-gray-700 px-2 sm:px-3 py-1 border border-gray-200 hover:bg-gray-200 transition-colors flex items-center gap-1 whitespace-nowrap"
                                disabled={guardando}
                              >
                                <span className="text-xs sm:text-sm">+</span> Agregar
                              </button>
                            </div>
                            
                            <div className="space-y-2 mb-3 max-h-[200px] overflow-y-auto p-1">
                              {pkg.incluye && pkg.incluye.length > 0 ? (
                                pkg.incluye.map((beneficio, index) => (
                                  <div key={index} className="flex items-center gap-2 group">
                                    <span className="text-gray-400 text-xs sm:text-sm flex-shrink-0">•</span>
                                    <input
                                      type="text"
                                      className="flex-1 border border-gray-200 px-2 sm:px-3 py-1.5 text-xs sm:text-sm focus:border-gray-400 outline-none bg-white min-w-0"
                                      value={beneficio}
                                      onChange={(e) => actualizarBeneficio(pkg.id, index, e.target.value)}
                                      placeholder={`Beneficio ${index + 1}`}
                                      disabled={guardando}
                                    />
                                    <button
                                      onClick={() => eliminarBeneficio(pkg.id, index)}
                                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                      title="Eliminar beneficio"
                                      disabled={guardando}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-gray-400 italic text-center py-2">Sin beneficios. Haz clic en "Agregar" para añadir.</p>
                              )}
                            </div>

                            <div className="flex justify-between items-center text-[8px] sm:text-[9px] text-gray-400 border-t border-gray-100 pt-2">
                              <span>Total: {pkg.incluye?.length || 0} beneficios</span>
                              {(pkg.incluye?.length === 0 || !pkg.incluye) && (
                                <span className="text-amber-500">⚠️ Agrega al menos un beneficio</span>
                              )}
                            </div>
                          </div>

                          <div className="col-span-1 md:col-span-2 mt-2 p-2 sm:p-3 bg-gray-50 border border-gray-100">
                            <p className="text-[8px] sm:text-[9px] text-gray-500 mb-2">📱 Vista previa en catálogo:</p>
                            {pkg.incluye && pkg.incluye.length > 0 ? (
                              <ul className="space-y-1">
                                {pkg.incluye.slice(0, 3).map((item, idx) => (
                                  <li key={idx} className="text-[9px] sm:text-[10px] text-gray-600 flex items-start gap-1">
                                    <span className="w-1 h-1 bg-gray-400 rounded-full mt-1 flex-shrink-0"></span>
                                    <span className="break-words">{item.length > 30 ? item.substring(0, 30) + '...' : item}</span>
                                  </li>
                                ))}
                                {pkg.incluye.length > 3 && (
                                  <li className="text-[8px] sm:text-[9px] text-gray-400 italic">
                                    +{pkg.incluye.length - 3} beneficios más
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <p className="text-[9px] sm:text-[10px] text-gray-400 italic">Sin beneficios visibles</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="lg:col-span-1 flex justify-end lg:justify-end mt-2 lg:mt-0">
                          <button 
                            onClick={() => eliminarPaquete(pkg.id)} 
                            className="text-red-400 hover:text-red-600 text-xs sm:text-sm transition-colors border border-red-100 hover:border-red-200 px-2 sm:px-3 py-1 rounded flex items-center gap-1"
                            title="Eliminar paquete completo"
                            disabled={guardando}
                          >
                            <span>🗑️</span>
                            <span className="text-[8px] sm:text-[10px]">Eliminar</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
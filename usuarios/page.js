// app/usuarios/page.js (VERSIÓN CON BOTÓN DE CERRAR SESIÓN)
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import { useNotifications } from '../hooks/useNotifications';

export default function UsuariosPage() {
  const router = useRouter();
  const { 
    usuario, 
    cargando: authCargando, 
    leerTodos, 
    actualizar, 
    eliminar,
    crear,
    cerrarSesion,
    COLLECTIONS 
  } = useFirebase();
  const { crearNotificacion } = useNotifications();

  const [usuarios, setUsuarios] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [modalUsuario, setModalUsuario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formUsuario, setFormUsuario] = useState({
    nombre: '',
    email: '',
    rol: 'empleado',
    activo: true,
    codigoAcceso: ''
  });

  const esAdmin = usuario?.rol === 'admin';
  const isMounted = useRef(true);

  // Códigos secretos (deben coincidir con auth/page.js)
  const ADMIN_SECRET_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || "EVR2026ADMIN";
  const EMPLOYEE_SECRET_CODE = process.env.NEXT_PUBLIC_EMPLOYEE_CODE || "EVR2026EMP";

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

  // Protección de ruta - solo admin
  useEffect(() => {
    if (!authCargando && (!usuario || usuario.rol !== 'admin')) {
      router.push('/auth');
    }
  }, [usuario, authCargando, router]);

  // Cargar usuarios
  useEffect(() => {
    if (!usuario || !esAdmin) return;

    const cargarUsuarios = async () => {
      setSincronizando(true);
      try {
        const data = await leerTodos(COLLECTIONS.USUARIOS);
        if (isMounted.current) {
          setUsuarios(data || []);
          setCargado(true);
        }
      } catch (error) {
        console.error('Error cargando usuarios:', error);
      } finally {
        setSincronizando(false);
      }
    };

    cargarUsuarios();
  }, [usuario, esAdmin, leerTodos]);

  // Filtrar usuarios
  const usuariosFiltrados = usuarios.filter(u => 
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.rol?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Activar/Desactivar usuario
  const toggleActivo = async (id, activoActual) => {
    if (!esAdmin) return;
    
    setSincronizando(true);
    try {
      await actualizar(COLLECTIONS.USUARIOS, id, { 
        activo: !activoActual,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario.nombre
      });
      
      // Crear notificación para el usuario afectado
      const usuarioAfectado = usuarios.find(u => u.id === id);
      if (usuarioAfectado) {
        await crearNotificacion({
          usuarioId: id,
          tipo: 'estado_usuario',
          titulo: !activoActual ? 'Cuenta activada' : 'Cuenta desactivada',
          mensaje: `Tu cuenta ha sido ${!activoActual ? 'activada' : 'desactivada'} por el administrador.`,
          prioridad: 'alta'
        });
      }
      
      // Actualizar lista local
      setUsuarios(prev => prev.map(u => 
        u.id === id ? { ...u, activo: !activoActual } : u
      ));
    } catch (error) {
      console.error('Error cambiando estado:', error);
      alert('Error al cambiar el estado del usuario');
    } finally {
      setSincronizando(false);
    }
  };

  // Cambiar rol
  const cambiarRol = async (id, nuevoRol) => {
    if (!esAdmin) return;
    
    setSincronizando(true);
    try {
      await actualizar(COLLECTIONS.USUARIOS, id, { 
        rol: nuevoRol,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario.nombre
      });
      
      // Crear notificación
      const usuarioAfectado = usuarios.find(u => u.id === id);
      if (usuarioAfectado) {
        await crearNotificacion({
          usuarioId: id,
          tipo: 'rol_actualizado',
          titulo: 'Rol actualizado',
          mensaje: `Tu rol ha sido cambiado a ${nuevoRol === 'admin' ? 'Administrador' : 'Empleado'}.`,
          prioridad: 'media'
        });
      }
      
      setUsuarios(prev => prev.map(u => 
        u.id === id ? { ...u, rol: nuevoRol } : u
      ));
    } catch (error) {
      console.error('Error cambiando rol:', error);
      alert('Error al cambiar el rol');
    } finally {
      setSincronizando(false);
    }
  };

  // Eliminar usuario
  const eliminarUsuario = async (id) => {
    if (!esAdmin) return;
    if (id === usuario?.id) {
      alert('No puedes eliminar tu propia cuenta');
      return;
    }
    
    if (!confirm('¿Eliminar este usuario permanentemente? Esta acción no se puede deshacer.')) return;
    
    setSincronizando(true);
    try {
      await eliminar(COLLECTIONS.USUARIOS, id);
      setUsuarios(prev => prev.filter(u => u.id !== id));
      alert('Usuario eliminado correctamente');
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      alert('Error al eliminar el usuario');
    } finally {
      setSincronizando(false);
    }
  };

  // Crear usuario manualmente
  const crearUsuarioManual = async (e) => {
    e.preventDefault();
    
    if (!formUsuario.nombre || !formUsuario.email) {
      alert('Complete todos los campos');
      return;
    }
    
    // Validar código según rol
    if (formUsuario.rol === 'admin' && formUsuario.codigoAcceso !== ADMIN_SECRET_CODE) {
      alert('Código de administrador incorrecto');
      return;
    }
    if (formUsuario.rol === 'empleado' && formUsuario.codigoAcceso !== EMPLOYEE_SECRET_CODE) {
      alert('Código de empleado incorrecto');
      return;
    }
    
    setSincronizando(true);
    try {
      // Verificar si ya existe
      const existente = usuarios.find(u => u.email === formUsuario.email);
      if (existente) {
        alert('Ya existe un usuario con este email');
        return;
      }
      
      const nuevoUsuario = {
        nombre: formUsuario.nombre,
        email: formUsuario.email,
        rol: formUsuario.rol,
        activo: formUsuario.activo,
        fechaRegistro: new Date().toLocaleDateString(),
        fechaRegistroISO: new Date().toISOString(),
        creadoPor: usuario.nombre,
        creadoPorId: usuario.id,
        passwordTemporal: 'pendiente'
      };
      
      await crear(COLLECTIONS.USUARIOS, nuevoUsuario);
      
      setModalUsuario(false);
      setFormUsuario({
        nombre: '',
        email: '',
        rol: 'empleado',
        activo: true,
        codigoAcceso: ''
      });
      
      // Recargar lista
      const data = await leerTodos(COLLECTIONS.USUARIOS);
      setUsuarios(data || []);
      
      alert('Usuario creado correctamente. El usuario deberá registrarse con su email y el código correspondiente.');
    } catch (error) {
      console.error('Error creando usuario:', error);
      alert('Error al crear el usuario');
    } finally {
      setSincronizando(false);
    }
  };

  if (authCargando || !cargado) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-400">Cargando panel de usuarios...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-light">
      <div className="max-w-7xl mx-auto">
        
        {/* Indicador de sincronización */}
        {sincronizando && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs z-50 animate-pulse">
            {sincronizando ? 'Cargando...' : 'Guardando...'}
          </div>
        )}
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-3">
          <div>
            <nav className="mb-2 flex items-center justify-between gap-4 flex-wrap">
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-900 transition-colors">
                ← Volver al Dashboard
              </Link>
              {/* 🔴 NUEVO: Botón de cerrar sesión */}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-900 transition-colors border border-gray-200 px-3 py-1 rounded"
              >
                🚪 Cerrar sesión
              </button>
            </nav>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight">👥 Gestión de Usuarios</h1>
            <p className="text-xs text-gray-400 mt-1">
              Administra cuentas de empleados y administradores · Tiempo real
            </p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="flex-1 md:w-64">
              <input 
                type="text" 
                placeholder="Buscar por nombre, email o rol..." 
                className="w-full border border-gray-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-gray-400 outline-none"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button
              onClick={() => setModalUsuario(true)}
              className="bg-gray-900 text-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              + Nuevo Usuario
            </button>
          </div>
        </header>

        {/* Estadísticas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="border border-gray-200 p-3 bg-gray-50">
            <p className="text-[8px] sm:text-[10px] text-gray-500">Total usuarios</p>
            <p className="text-xl sm:text-2xl font-light">{usuarios.length}</p>
          </div>
          <div className="border border-gray-200 p-3 bg-blue-50">
            <p className="text-[8px] sm:text-[10px] text-gray-500">Administradores</p>
            <p className="text-xl sm:text-2xl font-light text-blue-600">
              {usuarios.filter(u => u.rol === 'admin').length}
            </p>
          </div>
          <div className="border border-gray-200 p-3 bg-green-50">
            <p className="text-[8px] sm:text-[10px] text-gray-500">Empleados</p>
            <p className="text-xl sm:text-2xl font-light text-green-600">
              {usuarios.filter(u => u.rol === 'empleado').length}
            </p>
          </div>
          <div className="border border-gray-200 p-3 bg-amber-50">
            <p className="text-[8px] sm:text-[10px] text-gray-500">Usuarios activos</p>
            <p className="text-xl sm:text-2xl font-light text-amber-600">
              {usuarios.filter(u => u.activo !== false).length}
            </p>
          </div>
        </div>

        {/* Tabla de usuarios */}
        <div className="border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Rol</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Fecha registro</th>
                <th className="p-3 text-center font-medium">Acciones</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-400">
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-medium">{u.nombre}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">
                      {esAdmin && u.id !== usuario?.id ? (
                        <select
                          value={u.rol}
                          onChange={(e) => cambiarRol(u.id, e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                        >
                          <option value="empleado">👤 Empleado</option>
                          <option value="admin">👑 Administrador</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          u.rol === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {u.rol === 'admin' ? '👑 Admin' : '👤 Empleado'}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {esAdmin && u.id !== usuario?.id ? (
                        <button
                          onClick={() => toggleActivo(u.id, u.activo !== false)}
                          className={`px-2 py-0.5 rounded text-xs ${
                            u.activo !== false 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.activo !== false ? '✅ Activo' : '❌ Inactivo'}
                        </button>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          u.activo !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {u.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">
                      {u.fechaRegistro || new Date(u.fechaRegistroISO).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-center">
                      {esAdmin && u.id !== usuario?.id && (
                        <button
                          onClick={() => eliminarUsuario(u.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Eliminar usuario"
                        >
                          🗑️
                        </button>
                      )}
                      {u.id === usuario?.id && (
                        <span className="text-xs text-gray-400">(Tú)</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Información de roles */}
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-[10px] text-gray-500">
          <p className="font-medium mb-1">📋 Información de roles:</p>
          <p>• <strong>Administrador:</strong> Acceso completo a todas las funciones del sistema.</p>
          <p>• <strong>Empleado:</strong> Acceso solo a la sección de Operaciones.</p>
          <p>• Los códigos de registro están configurados en las variables de entorno.</p>
        </div>

        {/* MODAL CREAR USUARIO */}
        {modalUsuario && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium">➕ Crear Usuario Manualmente</h3>
                <button 
                  onClick={() => setModalUsuario(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={crearUsuarioManual} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formUsuario.nombre}
                    onChange={(e) => setFormUsuario({...formUsuario, nombre: e.target.value})}
                    placeholder="Ej: Juan Pérez"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formUsuario.email}
                    onChange={(e) => setFormUsuario({...formUsuario, email: e.target.value})}
                    placeholder="usuario@ejemplo.com"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rol *</label>
                  <select
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formUsuario.rol}
                    onChange={(e) => setFormUsuario({...formUsuario, rol: e.target.value})}
                  >
                    <option value="empleado">👤 Empleado</option>
                    <option value="admin">👑 Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {formUsuario.rol === 'admin' ? 'Código de administrador *' : 'Código de empleado *'}
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none"
                    value={formUsuario.codigoAcceso}
                    onChange={(e) => setFormUsuario({...formUsuario, codigoAcceso: e.target.value})}
                    placeholder={formUsuario.rol === 'admin' ? 'Código de admin' : 'Código de empleado'}
                  />
                  <p className="text-[8px] text-gray-400 mt-1">
                    El usuario necesitará este código para registrarse
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="activo"
                    checked={formUsuario.activo}
                    onChange={(e) => setFormUsuario({...formUsuario, activo: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <label htmlFor="activo" className="text-xs text-gray-500">
                    Usuario activo (puede iniciar sesión)
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={sincronizando}
                    className="flex-1 bg-gray-900 text-white py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {sincronizando ? 'Creando...' : 'Crear Usuario'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalUsuario(false)}
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
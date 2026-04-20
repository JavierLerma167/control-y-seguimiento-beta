// app/auth/page.js (VERSIÓN CORREGIDA - DISEÑO CONSISTENTE)
"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirebase } from '../providers/FirebaseProvider';
import { auth } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function AuthPage() {
  const router = useRouter();
  const { usuario, cargando: authCargando, leerTodos, actualizar, COLLECTIONS } = useFirebase();
  
  const [esLogin, setEsLogin] = useState(true);
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    confirmPassword: '',
    nombre: '', 
    rol: 'empleado',
    codigoAcceso: '' 
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resetPassword, setResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const [usuariosRegistrados, setUsuariosRegistrados] = useState([]);
  const [mostrarGestionUsuarios, setMostrarGestionUsuarios] = useState(false);

  // Códigos secretos desde variables de entorno
  const ADMIN_SECRET_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || "EVR2026ADMIN";
  const EMPLOYEE_SECRET_CODE = process.env.NEXT_PUBLIC_EMPLOYEE_CODE || "EVR2026EMP";

  const esAdmin = usuario?.rol === 'admin';

  // Verificar fortaleza de contraseña
  const checkPasswordStrength = (password) => {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    let label = '';
    let color = '';
    if (score <= 1) {
      label = 'Muy débil';
      color = 'bg-red-500';
    } else if (score === 2) {
      label = 'Débil';
      color = 'bg-orange-500';
    } else if (score === 3) {
      label = 'Media';
      color = 'bg-yellow-500';
    } else if (score === 4) {
      label = 'Fuerte';
      color = 'bg-blue-500';
    } else {
      label = 'Muy fuerte';
      color = 'bg-green-500';
    }
    
    setPasswordStrength({ score, label, color });
  };

  // Actualizar fortaleza cuando cambia la contraseña
  useEffect(() => {
    if (form.password) {
      checkPasswordStrength(form.password);
    } else {
      setPasswordStrength({ score: 0, label: '', color: '' });
    }
  }, [form.password]);

  // Cargar lista de usuarios (solo admin)
  const cargarUsuarios = async () => {
    if (!esAdmin) return;
    try {
      const users = await leerTodos(COLLECTIONS.USUARIOS);
      setUsuariosRegistrados(users || []);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
    }
  };

  // Si es admin, cargar usuarios
  useEffect(() => {
    if (esAdmin) {
      cargarUsuarios();
    }
  }, [esAdmin]);

  // 🔴 CORRECCIÓN: Redirigir según el rol (empleados a /administracion)
  useEffect(() => {
    if (!authCargando && usuario) {
      if (usuario.rol === 'admin') {
        router.push('/');
      } else {
        router.push('/administracion');
      }
    }
  }, [usuario, authCargando, router]);

  // Limpiar mensajes después de 5 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Habilitar/Deshabilitar usuario (solo admin)
  const handleToggleUsuario = async (usuarioId, activoActual) => {
    if (!esAdmin) return;
    
    setCargando(true);
    try {
      await actualizar(COLLECTIONS.USUARIOS, usuarioId, { 
        activo: !activoActual,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: usuario?.nombre
      });
      setSuccessMessage(`Usuario ${!activoActual ? 'habilitado' : 'deshabilitado'} correctamente`);
      cargarUsuarios();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      setError('Error al cambiar el estado del usuario');
    } finally {
      setCargando(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setCargando(true);

    try {
      if (esLogin) {
        // ========== LOGIN ==========
        const userCredential = await signInWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;
        
        const userDoc = await getDoc(doc(db, COLLECTIONS.USUARIOS, user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        
        if (userData.activo === false) {
          setError('❌ Tu cuenta ha sido desactivada. Contacta al administrador.');
          setCargando(false);
          return;
        }
        
        localStorage.setItem('session_active', 'true');
        localStorage.setItem('session_user', JSON.stringify({
          id: user.uid,
          nombre: userData.nombre || user.displayName || user.email,
          email: user.email,
          rol: userData.rol || 'empleado'
        }));
        
        // 🔴 CORRECCIÓN: Redirigir según el rol
        if (userData.rol === 'admin') {
          router.push('/');
        } else {
          router.push('/administracion');
        }
      } else {
        // ========== REGISTRO (público - cualquiera puede registrarse con código) ==========
        if (form.password !== form.confirmPassword) {
          setError('❌ Las contraseñas no coinciden');
          setCargando(false);
          return;
        }
        
        if (form.password.length < 6) {
          setError('❌ La contraseña debe tener al menos 6 caracteres');
          setCargando(false);
          return;
        }
        
        // Validar código según rol
        if (form.rol === 'admin' && form.codigoAcceso !== ADMIN_SECRET_CODE) {
          setError('❌ Código de administrador incorrecto');
          setCargando(false);
          return;
        }
        
        if (form.rol === 'empleado' && form.codigoAcceso !== EMPLOYEE_SECRET_CODE) {
          setError('❌ Código de empleado incorrecto');
          setCargando(false);
          return;
        }

        // Verificar si el email ya está registrado
        const existingUsers = await leerTodos(COLLECTIONS.USUARIOS, {
          campo: 'email',
          operador: '==',
          valor: form.email
        });
        
        if (existingUsers && existingUsers.length > 0) {
          setError('❌ Este email ya está registrado');
          setCargando(false);
          return;
        }

        // Crear usuario en Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: form.nombre });
        
        // Guardar datos en Firestore
        await setDoc(doc(db, COLLECTIONS.USUARIOS, user.uid), {
          uid: user.uid,
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
          activo: true,
          fechaRegistro: new Date().toLocaleDateString(),
          fechaRegistroISO: new Date().toISOString(),
          creadoEn: serverTimestamp()
        });
        
        const rolTexto = form.rol === 'admin' ? 'ADMINISTRADOR' : 'EMPLEADO';
        setSuccessMessage(`✅ Cuenta creada con éxito como ${rolTexto}. Ahora puedes iniciar sesión.`);
        
        // Limpiar formulario
        setForm({ 
          email: '', 
          password: '', 
          confirmPassword: '',
          nombre: '', 
          rol: 'empleado', 
          codigoAcceso: '' 
        });
        
        // Cambiar a login después de 2 segundos
        setTimeout(() => {
          setEsLogin(true);
        }, 2000);
      }
    } catch (err) {
      console.error('Error de autenticación:', err);
      
      switch (err.code) {
        case 'auth/user-not-found':
          setError('❌ Usuario no encontrado');
          break;
        case 'auth/wrong-password':
          setError('❌ Contraseña incorrecta');
          break;
        case 'auth/invalid-credential':
          setError('❌ Credenciales inválidas');
          break;
        case 'auth/email-already-in-use':
          setError('❌ Este email ya está registrado');
          break;
        case 'auth/weak-password':
          setError('❌ La contraseña es muy débil. Usa al menos 6 caracteres');
          break;
        case 'auth/invalid-email':
          setError('❌ Email inválido');
          break;
        case 'auth/too-many-requests':
          setError('❌ Demasiados intentos. Intenta más tarde');
          break;
        default:
          setError(`❌ Error: ${err.message}`);
      }
    } finally {
      setCargando(false);
    }
  };

  // ========== RECUPERAR CONTRASEÑA ==========
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      setError('❌ Ingresa tu correo electrónico');
      return;
    }
    
    setCargando(true);
    setError('');
    setResetMessage('');
    
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('✅ Se ha enviado un enlace de recuperación a tu correo electrónico');
      setTimeout(() => {
        setResetPassword(false);
        setResetEmail('');
        setResetMessage('');
      }, 5000);
    } catch (err) {
      console.error('Error al enviar recuperación:', err);
      if (err.code === 'auth/user-not-found') {
        setError('❌ No existe una cuenta con este correo electrónico');
      } else {
        setError('❌ Error al enviar el correo de recuperación');
      }
    } finally {
      setCargando(false);
    }
  };

  if (authCargando) {
    return (
      <main className="min-h-screen bg-white p-4 sm:p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-400">Cargando...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 p-3 sm:p-4 md:p-6 font-light">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <header className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight mb-2">
            EVR pro Services 2026
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {resetPassword 
              ? 'Recuperar contraseña' 
              : (esLogin ? 'Acceso al sistema' : 'Registro de usuario')}
          </p>
        </header>

        {/* FORMULARIO DE RECUPERACIÓN DE CONTRASEÑA */}
        {resetPassword ? (
          <div className="max-w-md mx-auto border border-gray-200 p-6 sm:p-8 bg-white">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Correo electrónico
                </label>
                <input 
                  type="email" 
                  required 
                  className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>

              {resetMessage && (
                <p className="text-xs text-green-600">
                  {resetMessage}
                </p>
              )}

              {error && (
                <p className="text-xs text-red-500">
                  {error}
                </p>
              )}

              <button 
                type="submit"
                disabled={cargando}
                className="w-full bg-gray-900 text-white text-sm py-2 sm:py-3 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>

              <button 
                type="button"
                onClick={() => {
                  setResetPassword(false);
                  setError('');
                  setResetMessage('');
                  setResetEmail('');
                }}
                className="w-full text-xs text-gray-400 hover:text-gray-900 transition-colors py-2"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            
            {/* COLUMNA IZQUIERDA - LOGIN / REGISTRO */}
            <div className="border border-gray-200 p-6 sm:p-8 bg-white">
              <h2 className="text-lg font-medium mb-4">
                {esLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </h2>
              
              {error && (
                <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-600 text-xs">
                  {error}
                </div>
              )}
              
              {successMessage && (
                <div className="mb-4 p-2 bg-green-50 border border-green-200 text-green-600 text-xs">
                  {successMessage}
                </div>
              )}
              
              <form onSubmit={handleAuth} className="space-y-4">
                {/* Campos de registro */}
                {!esLogin && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Nombre completo *
                      </label>
                      <input 
                        type="text" 
                        required 
                        className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                        value={form.nombre}
                        onChange={(e) => setForm({...form, nombre: e.target.value})}
                        placeholder="Ej: Juan Pérez"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Rol *
                      </label>
                      <select 
                        className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                        value={form.rol}
                        onChange={(e) => setForm({...form, rol: e.target.value, codigoAcceso: ''})}
                      >
                        <option value="empleado">👤 Empleado</option>
                        <option value="admin">👑 Administrador</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        {form.rol === 'admin' ? 'Código de administrador *' : 'Código de empleado *'}
                      </label>
                      <input 
                        type="password" 
                        required
                        className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                        value={form.codigoAcceso}
                        onChange={(e) => setForm({...form, codigoAcceso: e.target.value})}
                        placeholder={form.rol === 'admin' ? 'Código secreto de administrador' : 'Código de empleado'}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        {form.rol === 'admin' 
                          ? 'Contacta al administrador para obtener el código' 
                          : 'El código te fue proporcionado por el administrador'}
                      </p>
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Email *
                  </label>
                  <input 
                    type="email" 
                    required 
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    placeholder="tu@email.com"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Contraseña *
                  </label>
                  <input 
                    type="password" 
                    required 
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                    value={form.password}
                    onChange={(e) => setForm({...form, password: e.target.value})}
                    placeholder="Mínimo 6 caracteres"
                  />
                  {!esLogin && passwordStrength.label && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${passwordStrength.color} transition-all duration-300`} 
                            style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500">{passwordStrength.label}</span>
                      </div>
                    </div>
                  )}
                </div>

                {!esLogin && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Confirmar contraseña *
                    </label>
                    <input 
                      type="password" 
                      required 
                      className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 outline-none bg-white"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({...form, confirmPassword: e.target.value})}
                      placeholder="Repite la contraseña"
                    />
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <p className="text-[10px] text-red-500 mt-1">❌ Las contraseñas no coinciden</p>
                    )}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={cargando}
                  className="w-full bg-gray-900 text-white text-sm py-2 hover:bg-gray-800 transition-colors mt-2 disabled:opacity-50"
                >
                  {cargando ? 'Procesando...' : (esLogin ? 'Entrar' : 'Crear cuenta')}
                </button>
              </form>
              
              <div className="mt-4 text-center">
                <button 
                  onClick={() => {
                    setEsLogin(!esLogin);
                    setError('');
                    setSuccessMessage('');
                    setForm({ 
                      email: '', 
                      password: '', 
                      confirmPassword: '',
                      nombre: '', 
                      rol: 'empleado', 
                      codigoAcceso: '' 
                    });
                  }}
                  className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
                >
                  {esLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
              
              {esLogin && (
                <div className="mt-2 text-center">
                  <button 
                    onClick={() => setResetPassword(true)}
                    className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA - INFO (solo visible para admin logueado) */}
            {esAdmin && (
              <div className="border border-gray-200 p-6 sm:p-8 bg-white">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">👥 Gestión de Usuarios</h2>
                  <button
                    onClick={() => setMostrarGestionUsuarios(!mostrarGestionUsuarios)}
                    className="text-xs text-gray-500 hover:text-gray-900"
                  >
                    {mostrarGestionUsuarios ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                
                {mostrarGestionUsuarios && (
                  <>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {usuariosRegistrados.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No hay usuarios registrados</p>
                      ) : (
                        usuariosRegistrados.map((user) => (
                          <div key={user.uid || user.id} className="border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{user.nombre}</p>
                                <p className="text-xs text-gray-500">{user.email}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${
                                  user.rol === 'admin' 
                                    ? 'bg-purple-100 text-purple-700' 
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {user.rol === 'admin' ? 'Administrador' : 'Empleado'}
                                </span>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded ${
                                  user.activo !== false
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {user.activo !== false ? 'Activo' : 'Inactivo'}
                                </span>
                                <button
                                  onClick={() => handleToggleUsuario(user.uid || user.id, user.activo !== false)}
                                  disabled={cargando}
                                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                                    user.activo !== false
                                      ? 'bg-red-500 hover:bg-red-600 text-white'
                                      : 'bg-green-500 hover:bg-green-600 text-white'
                                  } disabled:opacity-50`}
                                >
                                  {user.activo !== false ? 'Deshabilitar' : 'Habilitar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-[10px] text-gray-500">
                      <p className="font-medium mb-1">📋 Información de roles:</p>
                      <p>• <strong>Administrador:</strong> Acceso completo a todas las funciones</p>
                      <p>• <strong>Empleado:</strong> Acceso a Operaciones y tareas asignadas</p>
                      <p>• <strong>Códigos:</strong> Admin: {ADMIN_SECRET_CODE} | Empleado: {EMPLOYEE_SECRET_CODE}</p>
                    </div>
                  </>
                )}
                
                {!mostrarGestionUsuarios && (
                  <div className="text-center py-8">
                    <p className="text-xs text-gray-400">
                      Haz clic en "Mostrar" para ver y gestionar los usuarios del sistema
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
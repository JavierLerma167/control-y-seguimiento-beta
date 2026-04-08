"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function AuthPage() {
  const [esLogin, setEsLogin] = useState(true);
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    nombre: '', 
    rol: 'empleado',
    codigoAcceso: '' 
  });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const router = useRouter();

  const ADMIN_SECRET_CODE = "EVR2026ADMIN";

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      if (esLogin) {
        // LOGIN con Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;
        
        // Obtener datos adicionales del usuario desde Firestore
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        
        // Guardar sesión
        localStorage.setItem('session_active', 'true');
        localStorage.setItem('session_user', JSON.stringify({
          id: user.uid,
          nombre: userData.nombre || user.email,
          email: user.email,
          rol: userData.rol || 'empleado'
        }));
        
        router.push('/');
      } else {
        // REGISTRO con Firebase Auth
        if (form.rol === 'admin' && form.codigoAcceso !== ADMIN_SECRET_CODE) {
          setError('Código de administrador incorrecto');
          setCargando(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: form.nombre });
        
        await setDoc(doc(db, 'usuarios', user.uid), {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
          fechaRegistro: new Date().toLocaleDateString(),
          activo: true
        });
        
        alert(`Cuenta creada con éxito como ${form.rol === 'admin' ? 'ADMINISTRADOR' : 'EMPLEADO'}. Ahora inicia sesión.`);
        setEsLogin(true);
        setForm({ email: '', password: '', nombre: '', rol: 'empleado', codigoAcceso: '' });
      }
    } catch (err) {
      console.error('Error de autenticación:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Usuario no encontrado');
      } else if (err.code === 'auth/wrong-password') {
        setError('Contraseña incorrecta');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este email ya está registrado');
      } else {
        setError('Error de autenticación: ' + err.message);
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm px-2 sm:px-0">
        
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight mb-1 sm:mb-2 px-2 sm:px-0">
            EVR pro Services 2026
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {esLogin ? 'Acceso al sistema' : 'Registro de usuario'}
          </p>
        </header>

        <form onSubmit={handleAuth} className="space-y-4 sm:space-y-5">
          {!esLogin && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Nombre completo
                </label>
                <input 
                  type="text" 
                  required 
                  className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                  value={form.nombre}
                  onChange={(e) => setForm({...form, nombre: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Rol
                </label>
                <select 
                  className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                  value={form.rol}
                  onChange={(e) => setForm({...form, rol: e.target.value})}
                >
                  <option value="empleado">Empleado</option>
                  <option value="admin">Administrador / Jefe</option>
                </select>
              </div>

              {form.rol === 'admin' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Código de administrador
                  </label>
                  <input 
                    type="password" 
                    required
                    className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
                    value={form.codigoAcceso}
                    onChange={(e) => setForm({...form, codigoAcceso: e.target.value})}
                    placeholder="Ingresa el código secreto"
                  />
                </div>
              )}
            </>
          )}
          
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Email
            </label>
            <input 
              type="email" 
              required 
              className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
              value={form.email}
              onChange={(e) => setForm({...form, email: e.target.value})}
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Contraseña
            </label>
            <input 
              type="password" 
              required 
              className="w-full border border-gray-200 px-3 sm:px-4 py-2 text-sm focus:border-gray-400 outline-none transition-colors bg-white"
              value={form.password}
              onChange={(e) => setForm({...form, password: e.target.value})}
            />
          </div>

          {error && (
            <p className="text-xs sm:text-sm text-red-500 px-1">
              {error}
            </p>
          )}

          <button 
            type="submit"
            disabled={cargando}
            className="w-full bg-gray-900 text-white text-sm py-2 sm:py-3 hover:bg-gray-800 transition-colors mt-1 sm:mt-2 disabled:opacity-50"
          >
            {cargando ? 'Procesando...' : (esLogin ? 'Entrar' : 'Crear cuenta')}
          </button>
        </form>

        <footer className="mt-4 sm:mt-6 text-center">
          <button 
            onClick={() => {
              setEsLogin(!esLogin);
              setError('');
              setForm({ email: '', password: '', nombre: '', rol: 'empleado', codigoAcceso: '' });
            }}
            className="text-xs sm:text-sm text-gray-400 hover:text-gray-900 transition-colors px-2 py-1"
          >
            {esLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </footer>
      </div>
    </main>
  );
}
// app/layout.js (VERSIÓN CORREGIDA)
"use client";
import "./globals.css";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { FirebaseProvider } from './providers/FirebaseProvider';
import { useFirebase } from './providers/FirebaseProvider';
import { useNotifications } from './hooks/useNotifications';

// Componente interno para el menú (necesita acceso a Firebase)
function NavContent() {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { usuario, cargando } = useFirebase();
  const { noLeidas, notificaciones, marcarComoLeida, eliminarNotificacion } = useNotifications();
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  const isActive = (path) => pathname === path;
  const navLinkStyle = "text-sm md:text-xs transition-colors duration-200 px-2 py-1 md:px-0 md:py-0";
  const activeStyle = "text-gray-900 font-medium";
  const inactiveStyle = "text-gray-400 hover:text-gray-600";

  // Navegación según rol del usuario
  const getNavigationLinks = () => {
    const allLinks = [
      { name: 'Control', path: '/', roles: ['admin', 'empleado'] },
      { name: 'Ventas', path: '/ventas', roles: ['admin'] },
      { name: 'Agenda', path: '/agenda', roles: ['admin'] },
      { name: 'Acreditación', path: '/acreditacion', roles: ['admin'] },
      { name: 'Conexiones', path: '/integraciones', roles: ['admin'] },
      { name: 'Operaciones', path: '/administracion', roles: ['admin', 'empleado'] },
      { name: 'Pedidos', path: '/pedidos', roles: ['admin'] },
      { name: 'Paquetes', path: '/paquetes', roles: ['admin'] },
      { name: 'Base de datos', path: '/database', roles: ['admin'] },
      { name: 'Usuarios', path: '/usuarios', roles: ['admin'] }
    ];

    if (!usuario) return allLinks.filter(l => l.roles.includes('empleado'));
    return allLinks.filter(l => l.roles.includes(usuario.rol));
  };

  const navigationLinks = getNavigationLinks();
  const esAdmin = usuario?.rol === 'admin';

  if (cargando) {
    return (
      <nav className="fixed top-0 left-0 w-full z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="h-16 flex items-center">
            <span className="text-xs text-gray-400">Cargando...</span>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white border-b border-gray-200' : 'bg-white/80 backdrop-blur-sm border-b border-gray-100'
      }`}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
          <div className="h-12 sm:h-14 md:h-16 flex items-center justify-between">
            <Link href="/" className="text-[10px] sm:text-xs md:text-sm font-light tracking-wider text-gray-900 hover:text-gray-600 transition-colors truncate max-w-[120px] sm:max-w-[180px] md:max-w-none">
              EVR pro Services.26
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2">
              {navigationLinks.map((link) => (
                <Link 
                  key={link.path}
                  href={link.path} 
                  className={`${navLinkStyle} ${isActive(link.path) ? activeStyle : inactiveStyle}`}
                >
                  {link.name}
                </Link>
              ))}
              
              {/* Notifications Icon */}
              <button 
                onClick={() => setMostrarNotificaciones(!mostrarNotificaciones)}
                className="relative ml-2 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm">🔔</span>
                {noLeidas > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                    {noLeidas > 9 ? '9+' : noLeidas}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2 md:hidden">
              <button 
                onClick={() => setMostrarNotificaciones(!mostrarNotificaciones)}
                className="relative p-1.5"
              >
                <span className="text-sm">🔔</span>
                {noLeidas > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                    {noLeidas}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setMenuAbierto(!menuAbierto)}
                className="flex flex-col items-end gap-1.5 p-1.5 sm:p-2"
                aria-label="Menú"
              >
                <span className={`block w-5 sm:w-6 h-0.5 bg-gray-900 transition-transform duration-300 ${
                  menuAbierto ? 'rotate-45 translate-y-2' : ''
                }`} />
                <span className={`block w-4 sm:w-5 h-0.5 bg-gray-900 transition-opacity duration-300 ${
                  menuAbierto ? 'opacity-0' : 'opacity-100'
                }`} />
                <span className={`block w-5 sm:w-6 h-0.5 bg-gray-900 transition-transform duration-300 ${
                  menuAbierto ? '-rotate-45 -translate-y-2' : ''
                }`} />
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 ${
            menuAbierto ? 'max-h-[70vh] sm:max-h-[400px] border-t border-gray-100' : 'max-h-0'
          }`}>
            <div className="py-2 sm:py-4 space-y-1 sm:space-y-2 max-h-[60vh] overflow-y-auto">
              {navigationLinks.map((link) => (
                <Link 
                  key={link.path}
                  href={link.path} 
                  className={`block text-xs sm:text-sm py-2 sm:py-2 px-2 sm:px-2 transition-colors ${
                    isActive(link.path) 
                      ? 'text-gray-900 bg-gray-50 font-medium' 
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                  onClick={() => setMenuAbierto(false)}
                >
                  {link.name}
                </Link>
              ))}
              {usuario && (
                <div className="pt-2 mt-2 border-t border-gray-100 text-[10px] text-gray-400 px-2">
                  {esAdmin ? '👑 Administrador' : '👤 Empleado'} · {usuario.nombre}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Notifications Panel */}
      {mostrarNotificaciones && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setMostrarNotificaciones(false)}
          />
          <div className="fixed top-14 sm:top-16 right-2 sm:right-4 w-80 sm:w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-[70vh] overflow-hidden">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-sm font-medium">Notificaciones</h3>
              <button 
                onClick={() => setMostrarNotificaciones(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {notificaciones.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No hay notificaciones
                </div>
              ) : (
                notificaciones.map(notif => (
                  <div 
                    key={notif.id} 
                    className={`p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!notif.leida ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-medium">{notif.titulo}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{notif.mensaje}</p>
                        <p className="text-[8px] text-gray-400 mt-1">{new Date(notif.fechaISO).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-1">
                        {!notif.leida && (
                          <button
                            onClick={() => marcarComoLeida(notif.id)}
                            className="text-[8px] text-blue-500 hover:text-blue-700"
                            title="Marcar como leída"
                          >
                            ✓
                          </button>
                        )}
                        <button
                          onClick={() => eliminarNotificacion(notif.id)}
                          className="text-[8px] text-gray-400 hover:text-red-500"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {menuAbierto && (
        <div 
          className="fixed inset-0 bg-black/5 z-40 md:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}
    </>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased bg-white text-gray-900">
        <FirebaseProvider>
          <NavContent />
          <div className="pt-12 sm:pt-14 md:pt-16 min-h-screen">
            {children}
          </div>
        </FirebaseProvider>
      </body>
    </html>
  );
}
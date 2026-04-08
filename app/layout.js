"use client";
import "./globals.css";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { FirebaseProvider } from './providers/FirebaseProvider';

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  const navigationLinks = [
    { name: 'Control', path: '/' },
    { name: 'Ventas', path: '/ventas' },
    { name: 'Agenda', path: '/agenda' },
    { name: 'Acreditación', path: '/acreditacion' },
    { name: 'Conexiones', path: '/integraciones' },
    { name: 'Operaciones', path: '/administracion' },
    { name: 'Pedidos', path: '/pedidos' },
    { name: 'Paquetes', path: '/paquetes' },
    { name: 'Base de datos', path: '/database' },
  ];

  return (
    <html lang="es">
      <body className="antialiased bg-white text-gray-900">
        <FirebaseProvider>
          <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
            scrolled ? 'bg-white border-b border-gray-200' : 'bg-white/80 backdrop-blur-sm border-b border-gray-100'
          }`}>
            <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
              <div className="h-12 sm:h-14 md:h-16 flex items-center justify-between">
                <Link href="/" className="text-[10px] sm:text-xs md:text-sm font-light tracking-wider text-gray-900 hover:text-gray-600 transition-colors truncate max-w-[120px] sm:max-w-[180px] md:max-w-none">
                  EVR pro Services.26
                </Link>

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
                </div>

                <button 
                  onClick={() => setMenuAbierto(!menuAbierto)}
                  className="md:hidden flex flex-col items-end gap-1.5 p-1.5 sm:p-2"
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
                </div>
              </div>
            </div>
          </nav>

          <div className="pt-12 sm:pt-14 md:pt-16 min-h-screen">
            {children}
          </div>

          {menuAbierto && (
            <div 
              className="fixed inset-0 bg-black/5 z-40 md:hidden"
              onClick={() => setMenuAbierto(false)}
            />
          )}
        </FirebaseProvider>
      </body>
    </html>
  );
}
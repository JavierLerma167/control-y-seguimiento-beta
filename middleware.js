// middleware.js (en la raíz del proyecto)
import { NextResponse } from 'next/server';

export function middleware(request) {
  // Obtener sesión de cookies (más segura que localStorage)
  const sessionUser = request.cookies.get('session_user')?.value;
  
  // Si no hay sesión, redirigir a login
  if (!sessionUser) {
    const url = request.nextUrl.clone();
    if (url.pathname !== '/auth') {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
    return NextResponse.next();
  }
  
  try {
    const user = JSON.parse(sessionUser);
    const path = request.nextUrl.pathname;
    
    // Rutas públicas (siempre accesibles)
    const publicPaths = ['/auth'];
    
    if (publicPaths.includes(path)) {
      return NextResponse.next();
    }
    
    // 🔴 CORRECCIÓN 1: Si es empleado y trata de acceder al dashboard (/), redirigir a /administracion
    if (user.rol === 'empleado' && path === '/') {
      return NextResponse.redirect(new URL('/administracion', request.url));
    }
    
    // Rutas solo para administradores
    const adminOnlyPaths = [
      '/ventas',
      '/agenda', 
      '/usuarios',
      '/database',
      '/paquetes',
      '/pedidos',
      '/integraciones',
      '/acreditacion'
    ];
    
    // Verificar si la ruta actual es solo para admin
    const isAdminOnly = adminOnlyPaths.some(adminPath => 
      path === adminPath || path.startsWith(adminPath + '/')
    );
    
    if (isAdminOnly && user.rol !== 'admin') {
      // Redirigir empleados a administracion
      return NextResponse.redirect(new URL('/administracion', request.url));
    }
    
    // 🔴 CORRECCIÓN 2: Empleados pueden acceder a /administracion (antes /operaciones)
    if (user.rol === 'empleado' && (path === '/administracion' || path.startsWith('/administracion/'))) {
      return NextResponse.next();
    }
    
    // 🔴 CORRECCIÓN 3: Administradores pueden acceder a todo
    if (user.rol === 'admin') {
      return NextResponse.next();
    }
    
    return NextResponse.next();
    
  } catch (error) {
    console.error('Error en middleware:', error);
    return NextResponse.redirect(new URL('/auth', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (authentication page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|auth).*)',
  ],
};
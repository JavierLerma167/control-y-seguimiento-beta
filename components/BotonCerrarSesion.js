// app/components/BotonCerrarSesion.js
"use client";
import { useFirebase } from '../providers/FirebaseProvider';
import { useRouter } from 'next/navigation';

export default function BotonCerrarSesion() {
  const { cerrarSesion } = useFirebase();
  const router = useRouter();

  const handleLogout = async () => {
    await cerrarSesion();
    localStorage.clear();
    sessionStorage.clear();
    router.push('/auth');
  };

  return (
    <button
      onClick={handleLogout}
      className="border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
    >
      Cerrar sesión
    </button>
  );
}
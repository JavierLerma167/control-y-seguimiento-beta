// app/components/GraficasPedidos.js
"use client";
import { useState, useEffect, useMemo } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

export default function GraficasPedidos({ pedidos, vista = 'mensual' }) {
  const [vistaGrafica, setVistaGrafica] = useState(vista);

  const datosGrafica = useMemo(() => {
    if (!pedidos || pedidos.length === 0) return { labels: [], values: [] };
    
    const ahora = new Date();
    const labels = [];
    const valores = [];
    
    // Obtener fecha segura
    const getFecha = (pedido) => {
      if (pedido.fechaRegistro) return new Date(pedido.fechaRegistro);
      if (pedido.fechaHora) return new Date(pedido.fechaHora);
      if (pedido.fecha) return new Date(pedido.fecha);
      return null;
    };
    
    let puntos = vistaGrafica === 'semanal' ? 7 : (vistaGrafica === 'mensual' ? 12 : 5);
    
    for (let i = puntos - 1; i >= 0; i--) {
      let fecha = new Date(ahora);
      let label = '';
      
      if (vistaGrafica === 'semanal') {
        fecha.setDate(ahora.getDate() - i);
        label = fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
      } else if (vistaGrafica === 'mensual') {
        fecha.setMonth(ahora.getMonth() - i);
        label = fecha.toLocaleDateString('es-MX', { month: 'short' });
      } else {
        fecha.setFullYear(ahora.getFullYear() - i);
        label = fecha.getFullYear().toString();
      }
      
      labels.push(label);
      
      const valor = pedidos.filter(p => {
        const fechaPedido = getFecha(p);
        if (!fechaPedido) return false;
        
        if (vistaGrafica === 'semanal') {
          return fechaPedido.toDateString() === fecha.toDateString();
        } else if (vistaGrafica === 'mensual') {
          return fechaPedido.getMonth() === fecha.getMonth() && 
                 fechaPedido.getFullYear() === fecha.getFullYear();
        } else {
          return fechaPedido.getFullYear() === fecha.getFullYear();
        }
      }).reduce((sum, p) => sum + (p.granTotal || 0), 0);
      
      valores.push(valor);
    }
    
    return { labels, values: valores };
  }, [pedidos, vistaGrafica]);

  const maxValor = Math.max(...datosGrafica.values, 1);

  if (pedidos.length === 0) {
    return <div className="text-center py-8 text-gray-400">No hay datos de pedidos para mostrar</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-gray-700">📊 Ingresos por Pedidos</h3>
        <div className="flex gap-2">
          <button onClick={() => setVistaGrafica('semanal')} className={`text-[10px] px-3 py-1 border ${vistaGrafica === 'semanal' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>Semanal</button>
          <button onClick={() => setVistaGrafica('mensual')} className={`text-[10px] px-3 py-1 border ${vistaGrafica === 'mensual' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>Mensual</button>
          <button onClick={() => setVistaGrafica('anual')} className={`text-[10px] px-3 py-1 border ${vistaGrafica === 'anual' ? 'bg-gray-900 text-white' : 'border-gray-200'}`}>Anual</button>
        </div>
      </div>
      
      <div className="h-48 flex items-end gap-1">
        {datosGrafica.values.map((valor, i) => {
          const height = maxValor > 0 ? (valor / maxValor) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group">
              <div className="w-full bg-blue-500 hover:bg-blue-600 transition-all duration-300 rounded-t relative" style={{ height: `${height}%`, minHeight: '4px' }}>
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  ${valor.toLocaleString()}
                </div>
              </div>
              <span className="text-[8px] text-gray-400 mt-1 truncate w-full text-center">{datosGrafica.labels[i]}</span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400 text-center">
        Total facturado: ${datosGrafica.values.reduce((a, b) => a + b, 0).toLocaleString()}
      </div>
    </div>
  );
}
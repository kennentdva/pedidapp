import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, ShoppingCart, Activity, DollarSign, Info, CalendarDays } from 'lucide-react';
import { type Pedido, MENU_CONFIG_ID } from '../store/orderStore';

export default function Estadisticas() {
  const [loading, setLoading] = useState(true);
  const [ventasTop, setVentasTop] = useState<any[]>([]);
  const [ingresosGrafico, setIngresosGrafico] = useState<any[]>([]);
  const [proyeccionInventario, setProyeccionInventario] = useState<any[]>([]);
  const [sopasTop, setSopasTop] = useState<any[]>([]);
  const [flujoPorDia, setFlujoPorDia] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Traer todos los pedidos entregados/empacados
    const { data: pedidosData } = await supabase.from('pedidos').select('*').not('responsable_id', 'eq', MENU_CONFIG_ID);
    // Traer todos los pagos
    const { data: pagosData } = await supabase.from('pagos').select('*');

    if (pedidosData && pagosData) {
      procesarGraficos(pedidosData as Pedido[], pagosData);
      procesarInventario(pedidosData as Pedido[]);
    }

    setLoading(false);
  };

  const procesarGraficos = (pedidos: Pedido[], pagos: any[]) => {
    // 1. Gráficos de Dona: Platos Estrella (Proteínas y Sopas más vendidas) y Flujo por Día
    const conteoProteinas: Record<string, number> = {};
    const conteoSopas: Record<string, number> = {};
    const conteoDiasSemana: Record<string, number> = {
      'Lunes': 0, 'Martes': 0, 'Miércoles': 0, 'Jueves': 0, 'Viernes': 0, 'Sábado': 0, 'Domingo': 0
    };
    const diasLetras = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    pedidos.forEach(p => {
       const prot = p.detalle?.proteina;
       if (prot) {
          conteoProteinas[prot] = (conteoProteinas[prot] || 0) + 1;
       }
       const sopa = p.detalle?.sopa;
       if (sopa) {
          conteoSopas[sopa] = (conteoSopas[sopa] || 0) + 1;
       }
       if (p.created_at) {
          const d = new Date(p.created_at);
          const diaNombre = diasLetras[d.getDay()];
          conteoDiasSemana[diaNombre] += 1;
       }
    });
    
    const arrProteinas = Object.entries(conteoProteinas)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5
    
    setVentasTop(arrProteinas);

    const arrSopas = Object.entries(conteoSopas)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5
    
    setSopasTop(arrSopas);

    const arrFlujo = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(dia => ({
      dia,
      pedidos: conteoDiasSemana[dia]
    }));
    setFlujoPorDia(arrFlujo);

    // 2. Gráfico de Barras: Ingresos de los últimos 7 días
    const ultimos7Dias = [...Array(7)].map((_, i) => {
       const d = new Date();
       d.setDate(d.getDate() - i);
       return d.toISOString().split('T')[0];
    }).reverse();

    const ingresosArray = ultimos7Dias.map(fecha => {
       // Sumar abonos de ese día
       const ingresosDia = pagos
         .filter(p => p.fecha?.startsWith(fecha) && !p.metodo.startsWith('Archivado') && !p.metodo.startsWith('Saldado'))
         .reduce((acc, curr) => acc + curr.monto, 0);

       const arr = fecha.split('-');
       let d = arr[2]; let m = arr[1];
       return {
          fecha: `${d}/${m}`,
          ingresos: ingresosDia
       };
    });

    setIngresosGrafico(ingresosArray);
  };

  const procesarInventario = (pedidos: Pedido[]) => {
    // Proyección de inventario basada en los CREADOS en los últimos 7 días
    const hace7DiasLocal = new Date();
    hace7DiasLocal.setDate(hace7DiasLocal.getDate() - 7);
    
    // Necesitamos comparar con el created_at que viene en UTC ISO string
    // Por simplicidad de tiempo, solo filtramos donde getTime sea > hace7Dias
    const pedidosUltimos7Dias = pedidos.filter(p => {
       const f = new Date(p.created_at || 0);
       return f.getTime() >= hace7DiasLocal.getTime();
    });

    const conteoProteinas7Dias: Record<string, number> = {};
    pedidosUltimos7Dias.forEach(p => {
       const prot = p.detalle?.proteina;
       if (prot) {
          conteoProteinas7Dias[prot] = (conteoProteinas7Dias[prot] || 0) + 1;
       }
    });

    // Proyección: Se recomienda comprar la misma cantidad + 15% de margen
    const proyeccion = Object.entries(conteoProteinas7Dias)
      .map(([name, sum]) => {
         const promedioDiario = sum / 7;
         const sugerido = Math.ceil(sum * 1.15); // +15% de holgura
         return {
            name,
            promedioDiario: promedioDiario.toFixed(1),
            sugerido7Dias: sugerido
         }
      })
      .sort((a, b) => b.sugerido7Dias - a.sugerido7Dias);

    setProyeccionInventario(proyeccion);
  };

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

  return (
    <div className="flex flex-col h-full p-4 md:p-10 text-neutral-100 max-w-7xl mx-auto selection:bg-blue-500/30">
      <div className="flex items-center gap-5 mb-10">
        <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/30 rotate-3">
          <Activity size={32} />
        </div>
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-white">Estadísticas</h2>
          <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest opacity-60">Analíticas y Proyecciones</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center py-20">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20 md:pb-0">
           
           {/* Top Platos */}
           <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
              <h3 className="text-xl font-black w-full text-left mb-6 flex gap-2 items-center"><TrendingUp className="text-orange-500"/> Top 5 Proteínas Más Vendidas</h3>
              <div className="w-full h-64">
                {ventasTop.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ventasTop}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {ventasTop.map((_entry, index) => (
                          <Cell key={`cell-prot-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', color: '#fff' }} itemStyle={{ color: '#fff', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="h-full flex items-center justify-center text-neutral-500 font-bold">Sin datos suficientes</div>
                )}
              </div>
           </div>

           {/* Top Sopas */}
           <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
              <h3 className="text-xl font-black w-full text-left mb-6 flex gap-2 items-center"><Info className="text-yellow-500" /> Top 5 Sopas Más Pedidas</h3>
              <div className="w-full h-64">
                {sopasTop.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sopasTop}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {sopasTop.map((_entry, index) => (
                          <Cell key={`cell-sopa-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', color: '#fff' }} itemStyle={{ color: '#fff', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="h-full flex items-center justify-center text-neutral-500 font-bold">Sin datos suficientes</div>
                )}
              </div>
           </div>

           {/* Ingresos 7 dias */}
           <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl flex flex-col">
              <h3 className="text-xl font-black w-full text-left mb-6 flex gap-2 items-center"><DollarSign className="text-emerald-500"/> Ingresos Últimos 7 Días</h3>
              <div className="w-full h-64 flex-1">
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ingresosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis dataKey="fecha" stroke="#525252" fontSize={12} tickMargin={10} />
                    <YAxis stroke="#525252" fontSize={12} tickFormatter={(value: any) => `$${value / 1000}k`} />
                    <Tooltip cursor={{fill: '#262626'}} contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px' }} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} formatter={(value: any) => `$${value.toLocaleString()}`} />
                    <Bar dataKey="ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </div>

           {/* Flujo de Comidas por Día */}
           <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl flex flex-col">
              <h3 className="text-xl font-black w-full text-left mb-6 flex gap-2 items-center"><CalendarDays className="text-blue-500"/> Días de Mayor Flujo (Histórico)</h3>
              <div className="w-full h-64 flex-1">
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flujoPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis dataKey="dia" stroke="#525252" fontSize={12} tickMargin={10} />
                    <YAxis stroke="#525252" fontSize={12} />
                    <Tooltip cursor={{fill: '#262626'}} contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px' }} itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }} formatter={(value: any) => `${value} pedidos`} />
                    <Bar dataKey="pedidos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </div>

           {/* Proyección Inventario */}
           <div className="bg-gradient-to-br from-indigo-900/40 to-blue-900/20 border border-indigo-900/50 rounded-3xl p-6 shadow-xl lg:col-span-2">
              <h3 className="text-xl font-black w-full text-left mb-2 flex gap-2 items-center"><ShoppingCart className="text-indigo-400"/> Proyección Inteligente de Compras (Próx. 7 Días)</h3>
              <p className="text-neutral-400 text-sm mb-6">Basado en tu ritmo de ventas de la última semana, sugerimos asegurar esta cantidad de proteínas preventivamente (incluye 15% de margen extra):</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                 {proyeccionInventario.map(item => (
                    <div key={item.name} className="bg-neutral-950/50 border border-indigo-500/20 rounded-2xl p-4 text-center hover:bg-neutral-900 transition-colors">
                       <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1 truncate" title={item.name}>{item.name}</p>
                       <p className="text-3xl font-black text-white font-mono">{item.sugerido7Dias}</p>
                       <p className="text-[10px] text-neutral-500 mt-1">({item.promedioDiario}/día aprox)</p>
                    </div>
                 ))}
                 {proyeccionInventario.length === 0 && (
                    <div className="col-span-full text-center py-6 text-neutral-500 font-bold">No hay datos de ventas en los últimos 7 días.</div>
                 )}
              </div>
           </div>

        </div>
      )}
    </div>
  );
}

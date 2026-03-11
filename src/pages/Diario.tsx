import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book, Calculator, DollarSign, CheckCircle2, AlertTriangle } from 'lucide-react';
import { type Pedido } from '../store/orderStore';

export default function Diario() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ingresosEfectivoHoy, setIngresosEfectivoHoy] = useState(0);
  const [dineroContado, setDineroContado] = useState<number | string>('');
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchTodosLosPedidos();
  }, []);

  const toggleGroup = (fecha: string) => {
    setExpandedDates(prev => ({ ...prev, [fecha]: !prev[fecha] }));
  };

  const fetchTodosLosPedidos = async () => {
    setLoading(true);
    
    // Obtener pedidos
    const { data: dataPedidos } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (dataPedidos) setPedidos(dataPedidos as Pedido[]);

    // Obtener abonos/pagos de HOY en Efectivo para el Arqueo
    const hoyStr = new Date().toISOString().split('T')[0];
    const { data: pagosHoy } = await supabase
      .from('pagos')
      .select('monto, metodo, fecha')
      .gte('fecha', `${hoyStr}T00:00:00`)
      .lte('fecha', `${hoyStr}T23:59:59`);

    if (pagosHoy) {
      const efectivo = pagosHoy
        .filter(p => typeof p.metodo === 'string' && p.metodo.includes('Efectivo'))
        .reduce((sum, p) => sum + p.monto, 0);
      setIngresosEfectivoHoy(efectivo);
    }

    setLoading(false);
  };

  const diferenciaArqueo = (Number(dineroContado) || 0) - ingresosEfectivoHoy;

  // Agrupar pedidos por fecha corta (YYYY-MM-DD)
  const grupos = pedidos.reduce((acc: Record<string, Pedido[]>, p) => {
    const fecha = new Date(p.created_at || '').toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    if (!acc[fecha]) acc[fecha] = [];
    acc[fecha].push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full p-4 md:p-10 text-neutral-100 max-w-2xl mx-auto selection:bg-orange-500/30">
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-gradient-to-br from-orange-400 to-red-600 text-white rounded-[2rem] shadow-2xl shadow-orange-500/30 rotate-3">
            <Book size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black tracking-tighter text-white">Diario</h2>
            <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest opacity-60">Histórico de pedidos</p>
          </div>
        </div>
        <div className="text-right">
           <p className="text-3xl font-black text-neutral-800 select-none">#{pedidos.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center py-20">
          <div className="w-12 h-12 rounded-full border-2 border-orange-500/20 border-t-orange-500 animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Tarjeta de Arqueo de Caja */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
                <Calculator size={120} />
             </div>
             
             <div className="relative z-10">
                <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2">
                   <Calculator className="text-blue-500" /> Arqueo de Caja Diario
                </h3>
                <p className="text-neutral-400 text-sm mb-6">Calcula si el dinero en efectivo de hoy te cuadra con el sistema.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                   
                   <div className="bg-neutral-950 rounded-2xl p-4 border border-neutral-800">
                      <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest mb-1">Efectivo Esperado (Sistema)</p>
                      <p className="text-2xl font-black text-white font-mono">${ingresosEfectivoHoy.toLocaleString()}</p>
                   </div>
                   
                   <div className="bg-blue-950/20 rounded-2xl p-4 border border-blue-900/50">
                      <p className="text-[10px] uppercase font-bold text-blue-400 tracking-widest mb-1">Dinero Físico (Billetes)</p>
                      <div className="flex items-center">
                         <DollarSign size={16} className="text-blue-500 mr-1" />
                         <input 
                            type="number" 
                            className="bg-transparent text-2xl font-black text-white font-mono outline-none w-full"
                            placeholder="0"
                            value={dineroContado}
                            onChange={e => setDineroContado(e.target.value)}
                         />
                      </div>
                   </div>

                   <div className={`rounded-2xl p-4 border flex flex-col justify-center transition-colors
                      ${dineroContado === '' ? 'bg-neutral-950 border-neutral-800' : 
                        Math.abs(diferenciaArqueo) < 100 ? 'bg-emerald-950/30 border-emerald-900/50' : 
                        diferenciaArqueo > 0 ? 'bg-orange-950/30 border-orange-900/50' : 'bg-red-950/30 border-red-900/50'}
                   `}>
                      <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest mb-1">Diferencia</p>
                      {dineroContado === '' ? (
                         <p className="text-neutral-600 text-sm font-bold">Ingresa billetes ↑</p>
                      ) : (
                         <div className="flex items-center gap-2">
                            {Math.abs(diferenciaArqueo) < 100 ? <CheckCircle2 className="text-emerald-500" size={20}/> : <AlertTriangle className={diferenciaArqueo > 0 ? 'text-orange-500' : 'text-red-500'} size={20}/>}
                            <p className={`text-xl font-black font-mono
                               ${Math.abs(diferenciaArqueo) < 100 ? 'text-emerald-400' : diferenciaArqueo > 0 ? 'text-orange-400' : 'text-red-400'}`}>
                               {diferenciaArqueo > 0 ? '+' : ''}{diferenciaArqueo.toLocaleString()}
                            </p>
                         </div>
                      )}
                      {dineroContado !== '' && Math.abs(diferenciaArqueo) >= 100 && (
                         <p className={`text-[10px] font-bold mt-1 ${diferenciaArqueo > 0 ? 'text-orange-500/70' : 'text-red-500/70'}`}>
                            {diferenciaArqueo > 0 ? 'Sobra dinero en caja' : 'Falta dinero en caja'}
                         </p>
                      )}
                      {dineroContado !== '' && Math.abs(diferenciaArqueo) < 100 && (
                         <p className="text-[10px] font-bold mt-1 text-emerald-500/70">
                            Caja cuadrada perfectamente
                         </p>
                      )}
                   </div>
                   
                </div>
             </div>
          </div>

          {Object.entries(grupos).map(([fecha, lista]) => {
            const isExpanded = !!expandedDates[fecha];
            return (
              <div key={fecha} className="group bg-neutral-900/50 border border-neutral-800/50 rounded-3xl overflow-hidden transition-all">
                {/* Fecha como encabezado de Nota Accordion */}
                <button 
                  onClick={() => toggleGroup(fecha)}
                  className="w-full px-6 py-5 flex justify-between items-center hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <h3 className="text-xl font-black text-orange-400 capitalize">
                      {fecha}
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mt-1">{lista.length} pedidos hoy</span>
                  </div>
                  <div className={`p-2 rounded-full bg-neutral-800 text-neutral-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 divide-y divide-neutral-800/50">
                    {lista.map(p => (
                      <div key={p.id} className="py-4 last:pb-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-lg text-white">{p.beneficiario || 'Invitado'}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600">
                            {new Date(p.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-neutral-500 text-sm font-medium leading-relaxed">
                          <span className="text-neutral-400">{p.detalle.proteina}</span>
                          {p.detalle.sopa && (
                            <span className="bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded ml-2 font-bold text-[10px] uppercase">
                              🍲 Sopa de {p.detalle.sopa}
                            </span>
                          )}
                          <span className="text-neutral-600 block mt-0.5 italic">
                             + {p.detalle.acompanamientos.join(', ')}
                             {p.detalle.extras?.length > 0 && ` + ${p.detalle.extras.join(', ')}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {pedidos.length === 0 && (
            <div className="text-center py-20 text-neutral-600 border-2 border-dashed border-neutral-900 rounded-3xl">
              No hay registros de pedidos aún.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book } from 'lucide-react';
import { type Pedido } from '../store/orderStore';

export default function Diario() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
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
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setPedidos(data as Pedido[]);
    setLoading(false);
  };

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
        <div className="space-y-4">
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

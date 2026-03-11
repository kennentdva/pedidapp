import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Check, Clock, Flame, UtensilsCrossed, Trash2, Edit2 } from 'lucide-react';
import { type Pedido } from '../store/orderStore';

export default function Cocina() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados para la edición rápida
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState<string>(new Date().toISOString().split('T')[0]);

  const fetchPedidos = async () => {
    try {
      setLoading(true);
      const localDate = new Date(fechaFiltro + 'T12:00:00'); // Usamos mediodía para evitar problemas de timezone al parsear el string
      // Formato YYYY-MM-DD local
      const offset = localDate.getTimezoneOffset()
      const localDateStr = new Date(localDate.getTime() - (offset*60*1000)).toISOString().split('T')[0]
      const startOfDay = new Date(`${localDateStr}T00:00:00`);
      const endOfDay = new Date(`${localDateStr}T23:59:59.999`);

      const { data } = await supabase
        .from('pedidos')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (data) setPedidos(data as Pedido[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();

    // Suscripción Realtime
    const channel = supabase.channel('pedidos-cocina-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidos(prev => [payload.new as Pedido, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setPedidos(prev => prev.map(p => p.id === payload.new.id ? payload.new as Pedido : p));
        } else if (payload.eventType === 'DELETE') {
          setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fechaFiltro]); // Refetch cuando cambie la fecha

  const actualizarEstadoCocina = async (id: string, nuevoEstado: 'pendiente' | 'empacado') => {
    // UI Update Optimista
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado_cocina: nuevoEstado } : p));
    
    // DB Update
    const { error } = await supabase.from('pedidos').update({ estado_cocina: nuevoEstado }).eq('id', id);

    if (error) {
      alert("Error al actualizar estado");
      fetchPedidos(); // Revertir en caso de error
    }
  };

  const eliminarPedido = async (id: string) => {
    if(!window.confirm('¿Deseas eliminar este pedido completamente de la lista?')) return;
    await supabase.from('pedidos').delete().eq('id', id);
    // Realtime channel detectará e hidatará el borrar.
  };

  const guardarEdicion = async (id: string, prop: string, valor: string) => {
    if(!valor.trim()) return setEditingId(null);
    await supabase.from('pedidos').update({ [prop]: valor }).eq('id', id);
    setEditingId(null);
  };

  // Cálculos del Dashboard
  const totalHoy = pedidos.length;
  const yaEmpacados = pedidos.filter(p => p.estado_cocina === 'empacado').length;
  const faltaEmpacar = totalHoy - yaEmpacados;

  // Cálculo de resumen por proteína de los pedidos que FALTAN por empacar
  const pedidosPendientes = pedidos.filter(p => p.estado_cocina !== 'empacado');
  const resumenProteinas = pedidosPendientes.reduce((acc, p) => {
    const prot = p.detalle?.proteina;
    if (prot && prot !== 'Solo Sopa') {
      acc[prot] = (acc[prot] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100 gap-6">
      
      {/* Dashboard Top */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 w-full">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
           <Flame size={20} className="text-orange-500 mb-1" />
           <span className="text-xs uppercase tracking-widest font-semibold mb-1 text-neutral-400">Total Hoy</span>
           <span className="text-2xl font-black text-white">{totalHoy}</span>
        </div>
        <div className="bg-neutral-900 border border-emerald-900/50 rounded-3xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
           <Check size={20} className="text-emerald-500 mb-1" />
           <span className="text-xs uppercase tracking-widest font-semibold mb-1 text-neutral-400">Terminados</span>
           <span className="text-2xl font-black text-emerald-400">{yaEmpacados}</span>
        </div>
        <div className="bg-neutral-900 border border-red-900/50 rounded-3xl p-4 shadow-xl flex flex-col items-center justify-center text-center">
           <Clock size={20} className="text-red-500 mb-1" />
           <span className="text-xs uppercase tracking-widest font-semibold mb-1 text-neutral-400">Por Hacer</span>
           <span className="text-2xl font-black text-red-400">{faltaEmpacar}</span>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-3 shadow-xl flex flex-col justify-center overflow-y-auto max-h-[100px] md:max-h-none">
           <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1 text-center w-full block border-b border-neutral-800 pb-1">Faltan por preparar</span>
           <div className="flex flex-wrap gap-2 justify-center content-center pt-1">
             {Object.entries(resumenProteinas).map(([prot, cant]) => (
               <div key={prot} className="flex flex-col items-center bg-neutral-950 px-2 rounded min-w-[50px]">
                 <span className="text-lg font-black text-orange-400">{cant}</span>
                 <span className="text-[10px] text-neutral-400 truncate max-w-[60px]">{prot}</span>
               </div>
             ))}
             {Object.keys(resumenProteinas).length === 0 && <span className="text-xs text-neutral-500 mt-2">Todo limpio 🧹</span>}
           </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 px-2 mt-2">
         <h2 className="text-2xl font-bold flex items-center gap-2"><ChefHat size={24} className="text-orange-500" /> Lista de Producción</h2>
         <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl">
           <span className="text-neutral-500 text-sm hidden md:block">Fecha:</span>
           <input 
             type="date"
             value={fechaFiltro}
             onChange={(e) => setFechaFiltro(e.target.value)}
             className="bg-transparent text-white outline-none border-none text-sm cursor-pointer"
           />
         </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
           <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 md:pb-0">
          {pedidos.map((p, i) => {
            const empacado = p.estado_cocina === 'empacado';
            const pendientes = p.estado_cocina === 'pendiente';
            const bgCard = empacado ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-neutral-900 border-neutral-800';
            const shadowCard = empacado ? '' : 'shadow-xl shadow-red-900/5 hover:shadow-red-900/10';
            const hora = new Date(p.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={p.id} className={`${bgCard} border rounded-3xl p-5 ${shadowCard} transition-all duration-300 flex flex-col`}>
                <div className="flex justify-between items-start mb-3 border-b border-neutral-700/50 pb-3">
                  <div className="flex gap-3 items-center">
                    <span className={`text-sm font-bold px-2 py-1 rounded w-10 text-center ${pendientes ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      #{String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      {editingId === p.id ? (
                        <input
                           type="text"
                           value={editName}
                           onChange={(e) => setEditName(e.target.value)}
                           onBlur={() => guardarEdicion(p.id!, 'beneficiario', editName)}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') guardarEdicion(p.id!, 'beneficiario', editName);
                             if (e.key === 'Escape') setEditingId(null);
                           }}
                           className="bg-neutral-800 text-white rounded px-2 py-1 w-full text-lg font-bold"
                           autoFocus
                         />
                      ) : (
                         <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditingId(p.id!); setEditName(p.beneficiario || ''); }}>
                           <span className="font-bold text-lg text-white group-hover:text-amber-400">{p.beneficiario}</span>
                           <Edit2 size={12} className="text-neutral-600 group-hover:text-amber-400" />
                         </div>
                      )}
                      <span className="text-xs text-neutral-500 block">{hora}</span>
                    </div>
                  </div>
                  <button onClick={() => eliminarPedido(p.id!)} className="text-neutral-600 p-1 hover:text-red-500 bg-neutral-800 rounded-lg"><Trash2 size={18}/></button>
                </div>

                <div className="flex-1 text-neutral-300 space-y-3 mb-6">
                  <p className="flex justify-between"><span className="text-neutral-500">Proteína:</span> <span className="font-bold text-white text-lg">{p.detalle?.proteina}</span></p>
                  <p className="flex justify-between"><span className="text-neutral-500">Acompañ.:</span> <span className="text-right text-sm">{p.detalle?.acompanamientos?.join(', ')}</span></p>
                   <div className="flex justify-between items-center py-2 px-3 bg-neutral-950 rounded-xl border border-neutral-800">
                      <span className="text-neutral-500 text-xs font-bold uppercase">Sopa:</span> 
                      <span className={`font-black text-sm uppercase ${p.detalle?.sopa ? 'text-orange-400' : 'text-neutral-700'}`}>
                        {p.detalle?.sopa ? `🍲 ${p.detalle.sopa}` : 'Sin sopa'}
                      </span>
                   </div>
                  {p.detalle?.extras && p.detalle.extras.length > 0 && (
                    <p className="flex justify-between"><span className="text-purple-400">Extras:</span> <span className="text-right text-sm text-purple-300">{p.detalle.extras.join(', ')}</span></p>
                  )}
                </div>

                <button 
                  onClick={() => actualizarEstadoCocina(p.id!, empacado ? 'pendiente' : 'empacado')}
                  className={`w-full py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 flex items-center justify-center gap-2
                    ${empacado ? 'bg-neutral-800 text-neutral-400 hover:text-white' : 'bg-orange-500 text-white shadow-xl shadow-orange-500/20 hover:bg-orange-600'}`}>
                  {empacado ? <UtensilsCrossed size={20} /> : <Check size={20} />}
                  {empacado ? 'Devolver a Cocina' : 'Marcar como Empacado'}
                </button>
              </div>
            );
          })}
          
          {pedidos.length === 0 && (
            <div className="col-span-full py-20 text-center text-neutral-500 flex flex-col items-center">
               <UtensilsCrossed size={48} className="mb-4 opacity-50" />
               <p className="text-xl">No hay pedidos registrados hoy.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

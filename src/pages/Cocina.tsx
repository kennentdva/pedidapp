import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Check, Clock, Flame, UtensilsCrossed, Trash2, Edit2, PenLine, Bell, BellOff } from 'lucide-react';
import { type Pedido, useOrderStore } from '../store/orderStore';
import { useNavigate } from 'react-router-dom';
import { useKitchenNotifications } from '../hooks/useKitchenNotifications';

export default function Cocina() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState<string>(new Date().toISOString().split('T')[0]);
  const { soundEnabled, requestPermission, playBeep } = useKitchenNotifications();
  const [toastNotificacion, setToastNotificacion] = useState<{ id: string, titulo: string, msj: string } | null>(null);

  const fetchPedidos = async () => {
    try {
      setLoading(true);
      const localDate = new Date(fechaFiltro + 'T12:00:00');
      const offset = localDate.getTimezoneOffset();
      const localDateStr = new Date(localDate.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
      const startOfDay = new Date(`${localDateStr}T00:00:00`);
      const endOfDay = new Date(`${localDateStr}T23:59:59.999`);
      const { data } = await supabase.from('pedidos').select('*').gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString()).order('created_at', { ascending: false });
      if (data) setPedidos(data as Pedido[]);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchPedidos();
    const channel = supabase.channel('pedidos-cocina-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const nuevo = payload.new as Pedido;
          setPedidos(prev => [nuevo, ...prev]);
          playBeep();
          const msj = `${nuevo.beneficiario || 'Cliente'} — ${(nuevo.detalle as any)?.items ? (nuevo.detalle as any).items.length + ' ítems' : nuevo.detalle?.proteina ?? ''}`;
          setToastNotificacion({ id: Date.now().toString(), titulo: '🍽️ Nuevo Pedido', msj });
          setTimeout(() => setToastNotificacion(null), 5000); // Ocultar después de 5s
        }
        else if (payload.eventType === 'UPDATE') setPedidos(prev => prev.map(p => p.id === payload.new.id ? payload.new as Pedido : p));
        else if (payload.eventType === 'DELETE') setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fechaFiltro, playBeep]);

  const actualizarEstadoCocina = async (id: string, nuevoEstado: 'pendiente' | 'empacado') => {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado_cocina: nuevoEstado } : p));
    const { error } = await supabase.from('pedidos').update({ estado_cocina: nuevoEstado }).eq('id', id);
    if (error) { alert("Error al actualizar estado"); fetchPedidos(); }
  };

  const eliminarPedido = async (id: string) => {
    if (!window.confirm('¿Deseas eliminar este pedido?')) return;
    await supabase.from('pedidos').delete().eq('id', id);
  };

  const guardarEdicion = async (id: string, prop: string, valor: string) => {
    if (!valor.trim()) return setEditingId(null);
    await supabase.from('pedidos').update({ [prop]: valor }).eq('id', id);
    setEditingId(null);
  };

  const editarEnVentas = async (p: Pedido) => {
    const { data: clienteData } = await supabase.from('clientes').select('*').eq('id', p.responsable_id || '').single();
    useOrderStore.setState({ editingPedidoId: p.id! });
    // If multi-item, restore carrito
    const items = (p.detalle as any)?.items;
    if (items && items.length > 0) {
      useOrderStore.setState({ responsable: clienteData || null, beneficiario: p.beneficiario || '', carrito: items, detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] }, valorBase: 0, precioManual: false });
    } else {
      useOrderStore.setState({ responsable: clienteData || null, beneficiario: p.beneficiario || '', carrito: [], detalle: p.detalle, valorBase: p.valor, precioManual: true });
    }
    navigate('/');
  };

  // Helper: flatten items from a pedido (multi-item aware)
  const getItems = (p: Pedido): any[] => {
    const items = (p.detalle as any)?.items;
    if (items && Array.isArray(items) && items.length > 0) return items;
    return [{ proteina: p.detalle?.proteina, sopa: p.detalle?.sopa, acompanamientos: p.detalle?.acompanamientos ?? [], extras: p.detalle?.extras ?? [], nota: p.detalle?.nota, tipoPlato: p.detalle?.tipoPlato }];
  };

  // Dashboard counters
  const totalHoy = pedidos.length;
  const yaEmpacados = pedidos.filter(p => p.estado_cocina === 'empacado').length;
  const faltaEmpacar = totalHoy - yaEmpacados;

  const pedidosPendientes = pedidos.filter(p => p.estado_cocina !== 'empacado');

  const resumenProteinas = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const prot = item?.proteina;
      if (prot && prot !== 'Solo Sopa' && item?.tipoPlato !== 'arroz' && item?.tipoPlato !== 'snack') {
        acc[prot] = (acc[prot] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const resumenSopas = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => { const s = item?.sopa; if (s) acc[s] = (acc[s] || 0) + 1; });
    return acc;
  }, {} as Record<string, number>);

  const resumenArroz = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      if (item?.tipoPlato === 'arroz') {
        const nombre = (item.proteina || '').replace(/^\d+x\s+/i, '').replace(/\s+(pequeña|grande)$/i, '');
        if (nombre) acc[nombre] = (acc[nombre] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const totalSopas = pedidos.reduce((acc, p) => { getItems(p).forEach(it => { if (it?.sopa) acc++; }); return acc; }, 0);
  const totalProteinas = pedidos.reduce((acc, p) => { getItems(p).forEach(it => { if (it?.proteina && it?.proteina !== 'Solo Sopa' && it?.tipoPlato !== 'arroz' && it?.tipoPlato !== 'snack') acc++; }); return acc; }, 0);
  const totalArroces = pedidos.reduce((acc, p) => { getItems(p).forEach(it => { if (it?.tipoPlato === 'arroz') acc++; }); return acc; }, 0);
  const totalArrocesPendientes = Object.values(resumenArroz).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100 gap-6">
      
      <h3 className="text-sm uppercase tracking-widest font-bold text-neutral-500 ml-2">Vista General de Producción (Hoy)</h3>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-2 w-full">
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Proteínas</span>
            <span className="text-xl font-black text-orange-400">{totalProteinas}</span>
         </div>
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Sopas</span>
            <span className="text-xl font-black text-amber-500">{totalSopas}</span>
         </div>
         <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">🍚 Arroces</span>
            <span className="text-xl font-black text-yellow-400">{totalArroces}</span>
         </div>
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Flame size={16} className="text-orange-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Pedidos Hoy</span>
            <span className="text-xl font-black text-white">{totalHoy}</span>
         </div>
         <div className="bg-neutral-900 border border-emerald-900/50 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Check size={16} className="text-emerald-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Terminados</span>
            <span className="text-xl font-black text-emerald-400">{yaEmpacados}</span>
         </div>
         <div className="bg-neutral-900 border border-red-900/50 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Clock size={16} className="text-red-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Por Hacer</span>
            <span className="text-xl font-black text-red-400">{faltaEmpacar}</span>
         </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full border-b border-neutral-800 pb-4">
        {/* Proteínas pendientes */}
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
        {/* Sopas pendientes */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-3 shadow-xl flex flex-col justify-center overflow-y-auto max-h-[100px] md:max-h-none">
           <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1 text-center w-full block border-b border-neutral-800 pb-1">Sopas Pendientes</span>
           <div className="flex flex-wrap gap-2 justify-center content-center pt-1">
             {Object.entries(resumenSopas).map(([sopa, cant]) => (
               <div key={sopa} className="flex flex-col items-center bg-neutral-950 px-2 rounded min-w-[50px]">
                 <span className="text-lg font-black text-amber-500">{cant}</span>
                 <span className="text-[10px] text-neutral-400 truncate max-w-[60px]">{sopa}</span>
               </div>
             ))}
             {Object.keys(resumenSopas).length === 0 && <span className="text-xs text-neutral-500 mt-2">Sin sopas 🍲</span>}
           </div>
        </div>
        {/* Arroces pendientes */}
        <div className="bg-yellow-950/20 border border-yellow-900/30 rounded-3xl p-3 shadow-xl flex flex-col justify-center overflow-y-auto max-h-[100px] md:max-h-none">
           <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1 text-center w-full block border-b border-yellow-900/20 pb-1">🍚 Arroces Pendientes ({totalArrocesPendientes})</span>
           <div className="flex flex-wrap gap-2 justify-center content-center pt-1">
             {Object.entries(resumenArroz).map(([nombre, cant]) => (
               <div key={nombre} className="flex flex-col items-center bg-neutral-950 px-2 rounded min-w-[50px]">
                 <span className="text-lg font-black text-yellow-400">{cant}</span>
                 <span className="text-[10px] text-neutral-400 truncate max-w-[70px]">{nombre}</span>
               </div>
             ))}
             {Object.keys(resumenArroz).length === 0 && <span className="text-xs text-neutral-500 mt-2">Sin arroces 🍚</span>}
           </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 px-2 mt-2">
         <h2 className="text-2xl font-bold flex items-center gap-2"><ChefHat size={24} className="text-orange-500" /> Lista de Producción</h2>
         <div className="flex items-center gap-2">
           {/* Notification Bell */}
           <button
             onClick={requestPermission}
             title={soundEnabled ? 'Sonido activado' : 'Activar sonido de alertas'}
             className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors ${
               soundEnabled
                 ? 'bg-emerald-500/20 border-emerald-700/50 text-emerald-400'
                 : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-amber-400 hover:border-amber-900/50 cursor-pointer animate-pulse'
             }`}
           >
             {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
             <span className="hidden md:block">
               {soundEnabled ? 'Sonido ON' : 'Activar Sonido'}
             </span>
           </button>
           {/* Date filter */}
           <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl">
             <span className="text-neutral-500 text-sm hidden md:block">Fecha:</span>
             <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="bg-transparent text-white outline-none border-none text-sm cursor-pointer" />
           </div>
         </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 md:pb-0">
          {pedidos.map((p, i) => {
            const empacado = p.estado_cocina === 'empacado';
            const pendientes = p.estado_cocina === 'pendiente';
            const hora = new Date(p.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const hasMultipleItems = !!(p.detalle as any)?.items;

            return (
              <div key={p.id} className={`${empacado ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-neutral-900 border-neutral-800 shadow-xl shadow-red-900/5'} border rounded-3xl p-5 transition-all duration-300 flex flex-col`}>
                <div className="flex justify-between items-start mb-3 border-b border-neutral-700/50 pb-3">
                  <div className="flex gap-3 items-center">
                    <span className={`text-sm font-bold px-2 py-1 rounded w-10 text-center ${pendientes ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>#{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      {editingId === p.id ? (
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => guardarEdicion(p.id!, 'beneficiario', editName)} onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(p.id!, 'beneficiario', editName); if (e.key === 'Escape') setEditingId(null); }} className="bg-neutral-800 text-white rounded px-2 py-1 w-full text-lg font-bold" autoFocus />
                      ) : (
                        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditingId(p.id!); setEditName(p.beneficiario || ''); }}>
                          <span className="font-bold text-lg text-white group-hover:text-amber-400">{p.beneficiario}</span>
                          <Edit2 size={12} className="text-neutral-600 group-hover:text-amber-400" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-neutral-500">{hora}</span>
                        {hasMultipleItems && <span className="text-[10px] font-black bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">{(p.detalle as any).items.length} ítems</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendientes && (<button onClick={() => editarEnVentas(p)} className="text-neutral-500 p-2 hover:text-amber-400 bg-neutral-800 rounded-lg transition-colors" title="Editar"><PenLine size={16} /></button>)}
                    <button onClick={() => eliminarPedido(p.id!)} className="text-neutral-600 p-2 hover:text-red-500 bg-neutral-800 rounded-lg transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>

                <div className="flex-1 text-neutral-300 space-y-2 mb-6">
                  {hasMultipleItems ? (
                    // Multi-item order: show each item in its own mini-card
                    <div className="space-y-2">
                      {((p.detalle as any).items as any[]).map((item: any, idx: number) => (
                        <div key={idx} className="bg-neutral-950 rounded-xl p-2 border border-neutral-800">
                          <p className="flex justify-between text-sm">
                            <span className="text-neutral-500">{item.tipoPlato === 'arroz' ? '🍚' : item.tipoPlato === 'snack' ? '🍦' : '🍗'}</span>
                            <span className="font-bold text-white text-right">{item.proteina}</span>
                          </p>
                          {item.sopa && <p className="text-xs text-orange-400 text-right mt-0.5">🍲 {item.sopa}</p>}
                          {item.acompanamientos?.length > 0 && <p className="text-xs text-neutral-500 text-right">{item.acompanamientos.join(', ')}</p>}
                          {item.nota && <p className="text-xs text-yellow-400 italic mt-1">⚠️ {item.nota}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Single-item legacy display
                    <>
                      <p className="flex justify-between"><span className="text-neutral-500">Proteína:</span> <span className="font-bold text-white text-lg">{p.detalle?.proteina}</span></p>
                      <p className="flex justify-between"><span className="text-neutral-500">Acompañ.:</span> <span className="text-right text-sm">{p.detalle?.acompanamientos?.join(', ')}</span></p>
                      <div className="flex justify-between items-center py-2 px-3 bg-neutral-950 rounded-xl border border-neutral-800">
                        <span className="text-neutral-500 text-xs font-bold uppercase">Sopa:</span>
                        <span className={`font-black text-sm uppercase ${p.detalle?.sopa ? 'text-orange-400' : 'text-neutral-700'}`}>{p.detalle?.sopa ? `🍲 ${p.detalle.sopa}` : 'Sin sopa'}</span>
                      </div>
                      {p.detalle?.extras && p.detalle.extras.length > 0 && (<p className="flex justify-between"><span className="text-purple-400">Extras:</span> <span className="text-right text-sm text-purple-300">{p.detalle.extras.join(', ')}</span></p>)}
                      {p.detalle?.nota && (<div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"><p className="text-yellow-400 text-sm font-medium italic">⚠️ Nota: {p.detalle.nota}</p></div>)}
                    </>
                  )}
                </div>

                <button onClick={() => actualizarEstadoCocina(p.id!, empacado ? 'pendiente' : 'empacado')}
                  className={`w-full py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${empacado ? 'bg-neutral-800 text-neutral-400 hover:text-white' : 'bg-orange-500 text-white shadow-xl shadow-orange-500/20 hover:bg-orange-600'}`}>
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

      {/* Floating In-App UI Toast for new orders */}
      {toastNotificacion && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 border-2 border-emerald-500 text-emerald-50 p-4 rounded-2xl shadow-2xl flex items-start gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-emerald-500 rounded-full p-2 mt-0.5"><Bell size={20} className="text-white animate-bounce" /></div>
          <div>
            <h4 className="font-black text-lg text-emerald-300">{toastNotificacion.titulo}</h4>
            <p className="text-emerald-100 mt-1 font-medium">{toastNotificacion.msj}</p>
          </div>
          <button onClick={() => setToastNotificacion(null)} className="text-emerald-500 hover:text-white p-1 ml-2"><Trash2 size={16}/></button>
        </div>
      )}
    </div>
  );
}

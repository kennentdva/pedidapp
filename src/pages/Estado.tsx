import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, CheckCircle2, Clock, UtensilsCrossed, RefreshCw } from 'lucide-react';
import { type Pedido } from '../store/orderStore';

// Helper: get display name from a pedido
function getDetalleLabel(p: Pedido): string {
  const d = p.detalle as any;
  if (d?.items && d.items.length > 0) {
    return d.items.map((it: any) => it.proteina).filter(Boolean).join(' · ');
  }
  return p.detalle?.proteina ?? '';
}

// Ticker component: scrolls names of empacados horizontally
function TickerBanner({ names }: { names: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const text = names.length > 0
    ? names.flatMap(n => [n, '•']).slice(0, -1).join('  ')
    : null;

  if (!text) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-emerald-950/95 border-t border-emerald-900/70 py-3 overflow-hidden z-50 shadow-2xl shadow-emerald-950">
      <div className="flex items-center gap-4 px-4 mb-1">
        <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest shrink-0">✅ Listos para recoger</span>
      </div>
      <div ref={containerRef} className="whitespace-nowrap overflow-hidden relative">
        <div className="inline-block animate-marquee">
          {Array(3).fill(text).map((t, i) => (
            <span key={i} className="text-white font-black text-lg mx-12 tracking-wide">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Estado() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [newReady, setNewReady] = useState<string | null>(null);

  const fetchPedidosHoy = async () => {
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const localMidnight = new Date(localDate);
    localMidnight.setHours(0, 0, 0, 0);
    const startOfDay = new Date(localMidnight.getTime() - offset * 60 * 1000);
    const localEnd = new Date(localDate);
    localEnd.setHours(23, 59, 59, 999);
    const endOfDay = new Date(localEnd.getTime() - offset * 60 * 1000);
    const { data } = await supabase.from('pedidos').select('*').gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString()).order('created_at', { ascending: true });
    if (data) { setPedidos(data as Pedido[]); setLastUpdated(new Date()); }
    setLoading(false);
  };

  useEffect(() => {
    fetchPedidosHoy();
    const channel = supabase.channel('estado-pedidos-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidos(prev => [...prev, payload.new as Pedido]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Pedido;
          setPedidos(prev => prev.map(p => p.id === updated.id ? updated : p));
          // Show "listo" flash for newly empacado orders
          if (updated.estado_cocina === 'empacado' && updated.beneficiario) {
            setNewReady(updated.beneficiario);
            setTimeout(() => setNewReady(null), 4000);
          }
        } else if (payload.eventType === 'DELETE') {
          setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
        }
        setLastUpdated(new Date());
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const enCocina = pedidos.filter(p => p.estado_cocina === 'pendiente');
  const listos = pedidos.filter(p => p.estado_cocina === 'empacado');
  const tickerNames = listos.map(p => p.beneficiario ?? 'Invitado').filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col pb-24">

      {/* Flash overlay when a new order is ready */}
      {newReady && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/80 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-emerald-500 rounded-3xl px-12 py-10 text-center shadow-2xl shadow-emerald-500/40">
            <p className="text-6xl mb-4">🎉</p>
            <p className="text-white font-black text-4xl mb-2">{newReady}</p>
            <p className="text-emerald-100 font-bold text-xl uppercase tracking-widest">¡Tu pedido está listo!</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-6 py-5 flex items-center justify-between sticky top-0 z-10 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl shadow-lg shadow-orange-500/30">
            <ChefHat size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Estado de Pedidos</h1>
            <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-neutral-600 text-xs font-bold">
          <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
          {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 px-4 md:px-8 py-8 max-w-5xl mx-auto w-full">

          {/* Counters */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-red-950/30 border border-red-900/50 rounded-3xl p-5 flex items-center gap-4">
              <div className="p-3 bg-red-500/20 rounded-2xl"><Clock size={24} className="text-red-400" /></div>
              <div>
                <p className="text-4xl font-black text-red-300">{enCocina.length}</p>
                <p className="text-xs font-bold text-red-500/70 uppercase tracking-widest">En Cocina</p>
              </div>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-3xl p-5 flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-2xl"><CheckCircle2 size={24} className="text-emerald-400" /></div>
              <div>
                <p className="text-4xl font-black text-emerald-300">{listos.length}</p>
                <p className="text-xs font-bold text-emerald-500/70 uppercase tracking-widest">Listos 🎉</p>
              </div>
            </div>
          </div>

          {/* Listos para recoger */}
          {listos.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-wider">✅ Listo para Recoger</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {listos.map(p => (
                  <div key={p.id} className="bg-emerald-950/20 border border-emerald-900/40 rounded-3xl p-5 relative overflow-hidden">
                    <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50" />
                    <p className="font-black text-2xl text-white mb-1 pr-5">{p.beneficiario || 'Invitado'}</p>
                    <p className="text-emerald-400 font-bold text-sm">{getDetalleLabel(p)}</p>
                    {!(p.detalle as any)?.items && p.detalle?.sopa && (<p className="text-orange-400/80 text-xs mt-1">🍲 {p.detalle.sopa}</p>)}
                    {!(p.detalle as any)?.items && p.detalle?.nota && (<p className="text-yellow-400/70 text-xs mt-1 italic">⚠️ {p.detalle.nota}</p>)}
                    <div className="mt-3 pt-3 border-t border-emerald-900/30">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-lg">¡Tu pedido está listo!</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* En Preparación */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50 animate-pulse" />
              <h2 className="text-xl font-black text-orange-400 uppercase tracking-wider">🍳 En Preparación</h2>
            </div>
            {enCocina.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {enCocina.map((p, i) => (
                  <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 relative overflow-hidden hover:border-orange-900/50 transition-colors">
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest mb-2 block">Turno #{i + 1}</span>
                    <p className="font-black text-2xl text-white mb-1 pr-5">{p.beneficiario || 'Invitado'}</p>
                    <p className="text-orange-400 font-bold text-sm">{getDetalleLabel(p)}</p>
                    {!(p.detalle as any)?.items && p.detalle?.sopa && (<p className="text-amber-400/80 text-xs mt-1">🍲 {p.detalle.sopa}</p>)}
                    {!(p.detalle as any)?.items && p.detalle?.nota && (<p className="text-yellow-400/70 text-xs mt-1 italic">⚠️ {p.detalle.nota}</p>)}
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-500/10 px-2 py-1 rounded-lg">Preparando...</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-neutral-600 border-2 border-dashed border-neutral-900 rounded-3xl flex flex-col items-center gap-3">
                <UtensilsCrossed size={40} className="opacity-40" />
                <p className="font-bold">No hay pedidos en preparación</p>
              </div>
            )}
          </section>

          {pedidos.length === 0 && (
            <div className="text-center py-20 text-neutral-600 border-2 border-dashed border-neutral-900 rounded-3xl flex flex-col items-center gap-3 mt-6">
              <UtensilsCrossed size={48} className="opacity-30" />
              <p className="font-bold text-lg">No hay pedidos registrados hoy</p>
              <p className="text-sm">Los pedidos aparecerán aquí en tiempo real</p>
            </div>
          )}
        </div>
      )}

      {/* Scrolling ticker at bottom */}
      <TickerBanner names={tickerNames} />
    </div>
  );
}

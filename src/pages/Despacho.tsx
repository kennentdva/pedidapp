import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Truck, Calendar, Trash2, Edit2, Search, Plus, X, ChevronDown, Check, Clock, Flame } from 'lucide-react';
import { type Pedido, useOrderStore } from '../store/orderStore';
import { getColombiaDateString, getColombiaStartOfDay, getColombiaEndOfDay } from '../lib/dateUtils';

export default function Despacho() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [fecha, setFecha] = useState<string>(getColombiaDateString());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editingPrecioId, setEditingPrecioId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number | string>('');
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraProteina, setExtraProteina] = useState('');
  const [extraSopa, setExtraSopa] = useState('');
  const [pedidoToDelete, setPedidoToDelete] = useState<string | null>(null);
  const menuConfig = useOrderStore(state => state.menuConfig);

  // 2-level accordion state: top-level (porPagar, pagados) + sub-categories
  const [openTop, setOpenTop] = useState<Record<string, boolean>>({ porPagar: true, pagados: false });
  const [openSub, setOpenSub] = useState<Record<string, boolean>>({ listos: true, arroces: false, snacks: false, sopas: false, restaurante: true });

  useEffect(() => { fetchPedidosPorFecha(); fetchClientes(); }, [fecha]);

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('id, nombre').order('nombre');
    if (data) setClientes(data);
  };

  const fetchPedidosPorFecha = async () => {
    setLoading(true);
    const start = getColombiaStartOfDay(fecha);
    const end = getColombiaEndOfDay(fecha);
    const { data } = await supabase.from('pedidos').select('*, clientes(nombre)').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false });
    if (data) setPedidos(data as any[]);
    setLoading(false);
  };

  const marcarEntregado = async (id: string, actual: string) => {
    const nuevoEstado = actual === 'en_espera' ? 'entregado' : 'en_espera';
    await supabase.from('pedidos').update({ estado_entrega: nuevoEstado }).eq('id', id);
    fetchPedidosPorFecha();
  };

  const togglePagado = async (p: Pedido) => {
    const nuevoEstado = !p.pagado;
    if (nuevoEstado && p.responsable_id) {
      const { error: errPago } = await supabase.from('pagos').insert([{ client_id: p.responsable_id, monto: p.valor, metodo: 'Efectivo' }]);
      if (errPago) { alert('Error al registrar el pago'); return; }
    }
    await supabase.from('pedidos').update({ pagado: nuevoEstado }).eq('id', p.id);
    fetchPedidosPorFecha();
  };

  const guardarNuevoPrecio = async (id: string) => {
    const valor = Number(nuevoPrecio);
    if (isNaN(valor) || valor < 0) return setEditingPrecioId(null);
    await supabase.from('pedidos').update({ valor }).eq('id', id);
    setEditingPrecioId(null);
    fetchPedidosPorFecha();
  };

  const eliminarPedido = (id: string) => setPedidoToDelete(id);

  const confirmarEliminarPedido = async () => {
    if (!pedidoToDelete) return;
    setLoading(true);
    await supabase.from('pedidos').delete().eq('id', pedidoToDelete);
    setPedidoToDelete(null);
    fetchPedidosPorFecha();
  };

  const guardarEdicion = async (id: string) => {
    if (!editName.trim()) return setEditingId(null);
    await supabase.from('pedidos').update({ beneficiario: editName }).eq('id', id);
    setEditingId(null);
    fetchPedidosPorFecha();
  };

  const asignarResponsable = async (pedidoId: string, clienteId: string) => {
    const resId = clienteId === 'null' ? null : clienteId;
    await supabase.from('pedidos').update({ responsable_id: resId }).eq('id', pedidoId);
    fetchPedidosPorFecha();
  };

  const crearPorcionExtra = async () => {
    if (!extraProteina) return alert('Seleccione proteína');
    const nuevoPedido = {
      beneficiario: 'Extra Stock',
      detalle: { 
        proteina: extraProteina, 
        sopa: extraSopa === 'Sin Sopa' ? null : extraSopa, 
        acompanamientos: [], 
        nota: 'Extra Despacho',
        tipoPlato: 'normal',
        valor: 14000,
        cantidad: 1,
        completado: false
      },
      valor: 14000, pagado: false, estado_cocina: 'empacado', estado_entrega: 'en_espera'
    };
    await supabase.from('pedidos').insert([nuevoPedido]);
    setShowExtraModal(false); setExtraProteina(''); setExtraSopa(''); fetchPedidosPorFecha();
  };

  const agregarSnackRapido = async (pedido: Pedido, snackNombre: string) => {
    let items = [...((pedido.detalle as any).items || [])];
    if (items.length === 0 && pedido.detalle.proteina) {
      items.push({ 
        proteina: pedido.detalle.proteina, 
        cantidad: 1, 
        tipoPlato: pedido.detalle.tipoPlato || 'normal', 
        acompanamientos: pedido.detalle.acompanamientos || [], 
        sopa: pedido.detalle.sopa || null, 
        completado: false,
        valor: pedido.valor,
        extras: pedido.detalle.extras || []
      });
    }
    const snackPrecios: Record<string, number> = { 'Boli': 2000, 'Helado': 3000 };
    const precio = snackPrecios[snackNombre] || 2000;
    const existingIdx = items.findIndex((it: any) => it.proteina === snackNombre);
    if (existingIdx >= 0) {
      items[existingIdx].cantidad = (items[existingIdx].cantidad || 1) + 1;
    } else {
      items.push({ 
        proteina: snackNombre, 
        cantidad: 1, 
        tipoPlato: 'snack', 
        completado: false,
        valor: precio,
        acompanamientos: [],
        sopa: null,
        extras: []
      });
    }
    const nuevoDetalle = { ...pedido.detalle, items };
    const nuevoValor = pedido.valor + precio;
    await supabase.from('pedidos').update({ detalle: nuevoDetalle, valor: nuevoValor }).eq('id', pedido.id!);
    fetchPedidosPorFecha();
  };

  const toggleItemCompletado = async (p: Pedido, index: number) => {
    const items = [...((p.detalle as any).items || [])];
    if (items[index]) {
      items[index].completado = !items[index].completado;
      const nuevoDetalle = { ...p.detalle, items };
      setPedidos(prev => prev.map(item => item.id === p.id ? { ...item, detalle: nuevoDetalle as any } : item));
      await supabase.from('pedidos').update({ detalle: nuevoDetalle }).eq('id', p.id!);
    }
  };

  const detalleText = (p: Pedido) => {
    const d = p.detalle as any;
    if (d?.items) {
      return d.items.map((i: any) => {
        const pStr = i.proteina === 'Solo Sopa' ? (i.sopa || 'Sopa') : (i.proteina || '');
        const sStr = (i.sopa && i.proteina !== 'Solo Sopa') ? ` + ${i.sopa}` : '';
        const cantStr = (i.cantidad || 1) > 1 ? `${i.cantidad}x ` : '';
        return `${cantStr}${pStr}${sStr}`;
      }).join(', ');
    }
    const baseProt = d.proteina === 'Solo Sopa' ? (d.sopa || 'Sopa') : (d.proteina || '');
    const baseSopa = (d.sopa && d.proteina !== 'Solo Sopa') ? ` + ${d.sopa}` : '';
    return `${baseProt}${baseSopa}`;
  };

  // ── Categorization helpers ──
  const esSoloArroz = (p: Pedido) => (p.detalle as any)?.items?.every((i: any) => i.tipoPlato === 'arroz') || p.detalle.tipoPlato === 'arroz';
  const esSoloSnack = (p: Pedido) => (p.detalle as any)?.items?.every((i: any) => i.tipoPlato === 'snack') || p.detalle.tipoPlato === 'snack';
  const esSoloSopa = (p: Pedido) => (p.detalle as any)?.items?.every((i: any) => i.proteina === 'Solo Sopa') || p.detalle.proteina === 'Solo Sopa';

  const isToday = fecha === getColombiaDateString();

  // Helper: flatten items from a pedido (multi-item aware)
  const getItems = (p: Pedido): any[] => {
    const items = (p.detalle as any)?.items;
    if (items && Array.isArray(items) && items.length > 0) return items;
    return [{ proteina: p.detalle?.proteina, sopa: p.detalle?.sopa, acompanamientos: p.detalle?.acompanamientos ?? [], extras: p.detalle?.extras ?? [], nota: p.detalle?.nota, tipoPlato: p.detalle?.tipoPlato }];
  };

  // ── Production summary logic (similar to Cocina) ──
  const pedidosFaltantes = pedidos.filter(p => p.estado_entrega !== 'entregado');

  const resumenProteinas = pedidosFaltantes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const prot = item?.proteina;
      const cant = item?.cantidad || 1;
      const isCompletado = item?.completado === true; // En despacho, "completado" significa empacado
      if (prot && !isCompletado && prot !== 'Solo Sopa' && item?.tipoPlato !== 'arroz' && item?.tipoPlato !== 'snack') {
        acc[prot] = (acc[prot] || 0) + cant;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const resumenSopas = pedidosFaltantes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const s = item?.sopa;
      const cant = item?.cantidad || 1;
      const isCompletado = item?.completado === true;
      if (s && !isCompletado) acc[s] = (acc[s] || 0) + cant;
    });
    return acc;
  }, {} as Record<string, number>);

  const resumenArroz = pedidosFaltantes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      if (item?.tipoPlato === 'arroz' && item?.completado !== true) {
        const proteinaStr = item.proteina || '';
        const cantidad = item.cantidad || 1;
        const sizeMatch = proteinaStr.match(/\s+(pequeña|grande)$/i);
        const tamaño = sizeMatch ? sizeMatch[1].toLowerCase() : 'pequeña';
        const nombre = proteinaStr.replace(/^\d+x\s+/i, '').replace(/\s+(pequeña|grande)$/i, '').trim();

        if (nombre) {
          if (!acc[nombre]) acc[nombre] = { total: 0, pequeña: 0, grande: 0 };
          acc[nombre].total += cantidad;
          if (tamaño === 'grande') acc[nombre].grande += cantidad;
          else acc[nombre].pequeña += cantidad;
        }
      }
    });
    return acc;
  }, {} as Record<string, { total: number, pequeña: number, grande: number }>);

  const totalArrocesPendientes = Object.values(resumenArroz).reduce((a, b) => a + b.total, 0);
  const totalHoy = pedidos.length;
  const yaEntregados = pedidos.filter(p => p.estado_entrega === 'entregado').length;
  const faltaEntregar = totalHoy - yaEntregados;
  const pedidosFiltrados = pedidos.filter(p => p.beneficiario?.toLowerCase().includes(searchTerm.toLowerCase()));

  // Top-level split
  const porPagarList = pedidosFiltrados.filter(p => !p.pagado);
  const pagadosList = pedidosFiltrados.filter(p => p.pagado);

  // Sub-categories within "Por Pagar"
  const listosParaEntregar = porPagarList.filter(p => p.estado_cocina === 'empacado' && p.estado_entrega === 'en_espera');
  const sArroces = porPagarList.filter(esSoloArroz);
  const sSnacks = porPagarList.filter(esSoloSnack);
  const sSopas = porPagarList.filter(p => esSoloSopa(p) && !esSoloArroz(p) && !esSoloSnack(p));
  const sRestaurante = porPagarList.filter(p => !esSoloArroz(p) && !esSoloSnack(p) && !esSoloSopa(p));

  // ── Components ──
  const TopAccordion = ({ id, title, count, color, children }: any) => (
    <div className={`border rounded-3xl overflow-hidden transition-all ${color}`}>
      <button
        onClick={() => setOpenTop(prev => ({ ...prev, [id]: !prev[id] }))}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-black text-base">{title}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white/20">{count}</span>
        </div>
        <ChevronDown size={20} className={`transition-transform text-white/60 ${openTop[id] ? 'rotate-180' : ''}`} />
      </button>
      {openTop[id] && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );

  const SubAccordion = ({ id, title, count, children, extraAction }: any) => (
    <div className="bg-neutral-950/50 border border-neutral-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpenSub(prev => ({ ...prev, [id]: !prev[id] }))}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-neutral-300">{title}</span>
          {count > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-neutral-700 text-neutral-300">{count}</span>}
        </div>
        <div className="flex items-center gap-2">
          {extraAction}
          <ChevronDown size={16} className={`transition-transform text-neutral-500 ${openSub[id] ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {openSub[id] && <div className="border-t border-neutral-800/50">{children}</div>}
    </div>
  );

  function OrderRows({ orders }: { orders: Pedido[] }) {
    if (orders.length === 0) return <div className="p-6 text-center text-neutral-600 text-sm">Vacío</div>;
    return (
      <div className="divide-y divide-neutral-800/50">
        {orders.map((p: any) => (
          <div key={p.id} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-800/30 transition-colors">
            {/* Name + detail */}
            <div className="flex-1 min-w-0">
              {editingId === p.id ? (
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => guardarEdicion(p.id)} onKeyDown={e => e.key === 'Enter' && guardarEdicion(p.id)} autoFocus className="bg-neutral-700 text-white rounded px-2 w-full text-sm" />
              ) : (
                <div className="flex items-center gap-1 font-bold text-sm text-white">
                  {p.beneficiario}
                  {isToday && <button onClick={() => { setEditingId(p.id); setEditName(p.beneficiario); }} className="text-neutral-600 hover:text-amber-400"><Edit2 size={11} /></button>}
                </div>
              )}
              {/* Items checklist */}
              {(p.detalle as any)?.items ? (
                <div className="mt-1 space-y-0.5">
                  {(p.detalle as any).items.map((it: any, itIdx: number) => (
                    <div key={itIdx} onClick={() => toggleItemCompletado(p, itIdx)} className={`flex items-center gap-1.5 text-[11px] cursor-pointer select-none ${it.completado ? 'line-through text-neutral-600' : 'text-neutral-400'}`}>
                      <div className={`w-2.5 h-2.5 rounded-sm border flex-shrink-0 ${it.completado ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-600'}`} />
                      <span>
                        {(it.cantidad || 1) > 1 && `${it.cantidad}x `}
                        {it.proteina === 'Solo Sopa' ? (it.sopa || 'Sopa') : it.proteina}
                        {it.sopa && it.proteina !== 'Solo Sopa' && <span className="text-amber-500/80 font-medium whitespace-nowrap"> + {it.sopa}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-neutral-500 mt-0.5">{detalleText(p)}</p>
              )}
            </div>

            {/* Responsable (compact) */}
            <select className="bg-neutral-800 text-[10px] font-bold p-1 rounded outline-none max-w-[90px] hidden md:block" value={p.responsable_id || 'null'} onChange={e => asignarResponsable(p.id, e.target.value)}>
              <option value="null">EFECTIVO</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            {/* Price */}
            <div className="text-sm font-black text-white shrink-0 cursor-pointer" onClick={() => { setEditingPrecioId(p.id); setNuevoPrecio(p.valor); }}>
              {editingPrecioId === p.id ? <input type="number" className="w-16 bg-neutral-800 text-xs rounded px-1" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} onBlur={() => guardarNuevoPrecio(p.id)} autoFocus /> : `$${p.valor?.toLocaleString()}`}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {isToday && (
                <button onClick={() => agregarSnackRapido(p, 'Boli')} className="w-6 h-6 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-colors" title="+ Boli">
                  <Plus size={13} />
                </button>
              )}
              {isToday && (
                <button onClick={() => marcarEntregado(p.id!, p.estado_entrega!)} className={`text-[9px] font-black uppercase px-2 py-1 rounded transition-colors ${p.estado_entrega === 'entregado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-400 hover:bg-emerald-600 hover:text-white'}`}>
                  {p.estado_entrega === 'entregado' ? '✓' : 'Entr.'}
                </button>
              )}
              {isToday && (
                <button onClick={() => togglePagado(p)} className={`text-[9px] font-black uppercase px-2 py-1 rounded ${p.pagado ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                  {p.pagado ? 'Pagado' : 'Cobrar'}
                </button>
              )}
              {isToday && (
                <button onClick={() => eliminarPedido(p.id)} className="text-neutral-700 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100 gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 text-blue-500 rounded-2xl"><Truck size={26} /></div>
          <div><h2 className="text-2xl font-bold">Despacho</h2><p className="text-neutral-400 text-sm">Control de entregas</p></div>
        </div>
        <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." className="bg-neutral-950 text-white rounded-xl py-2 pl-9 pr-3 outline-none border border-neutral-800 text-sm w-40 md:w-auto" />
          </div>
          <div className="flex items-center gap-1.5 px-2">
            <Calendar size={16} className="text-neutral-500" />
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-transparent text-white outline-none border-none py-1 text-sm" />
          </div>
        </div>
      </div>

      {/* Production summary logic cards (like Cocina) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
        {/* Proteínas pendientes */}
        <div className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 rounded-3xl p-4 shadow-xl flex flex-col min-h-[140px]">
           <span className="text-[10px] uppercase font-black text-neutral-500 mb-3 text-center w-full tracking-widest">Proteínas por Entregar</span>
           <div className="grid grid-cols-2 gap-2 flex-1">
             {Object.entries(resumenProteinas).map(([prot, cant]) => (
               <div key={prot} className="flex justify-between items-center bg-neutral-950/50 border border-neutral-800/50 px-3 py-2 rounded-xl">
                 <span className="text-xs font-bold text-neutral-400 truncate max-w-[80px]">{prot}</span>
                 <span className="text-lg font-black text-orange-400">{cant}</span>
               </div>
             ))}
             {Object.keys(resumenProteinas).length === 0 && <span className="col-span-2 text-center text-xs text-neutral-500 mt-2">Todo entregado 🏆</span>}
           </div>
        </div>

        {/* Sopas pendientes */}
        <div className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 rounded-3xl p-4 shadow-xl flex flex-col min-h-[140px]">
           <span className="text-[10px] uppercase font-black text-neutral-500 mb-3 text-center w-full tracking-widest">Sopas Pendientes</span>
           <div className="grid grid-cols-2 gap-2 flex-1">
             {Object.entries(resumenSopas).map(([sopa, cant]) => (
               <div key={sopa} className="flex justify-between items-center bg-neutral-950/50 border border-neutral-800/50 px-3 py-2 rounded-xl">
                 <span className="text-xs font-bold text-neutral-400 truncate max-w-[80px]">{sopa}</span>
                 <span className="text-lg font-black text-amber-500">{cant}</span>
               </div>
             ))}
             {Object.keys(resumenSopas).length === 0 && <span className="col-span-2 text-center text-xs text-neutral-500 mt-2">Sin sopas pend. 🥣</span>}
           </div>
        </div>

        {/* Arroces pendientes */}
        <div className="bg-yellow-950/10 backdrop-blur-md border border-yellow-900/30 rounded-3xl p-4 shadow-xl flex flex-col min-h-[140px]">
           <span className="text-[10px] uppercase font-black text-yellow-500/50 mb-3 text-center w-full tracking-widest">Arroces Pendientes ({totalArrocesPendientes})</span>
           <div className="flex flex-wrap gap-2 justify-center">
             {Object.entries(resumenArroz).map(([nombre, info]) => (
               <div key={nombre} className="flex flex-col items-center bg-neutral-950 px-3 py-2 rounded-xl border border-yellow-900/20">
                 <span className="text-xs text-neutral-400 mb-1">{nombre}</span>
                 <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-yellow-500">{info.pequeña}</span>
                        <span className="text-[8px] uppercase text-neutral-600">P</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-orange-500">{info.grande}</span>
                        <span className="text-[8px] uppercase text-neutral-600">G</span>
                    </div>
                 </div>
               </div>
             ))}
             {Object.keys(resumenArroz).length === 0 && <span className="text-center text-xs text-neutral-500 mt-2">Sin arroces 🍚</span>}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-2 w-full">
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Total Hoy</span>
            <span className="text-xl font-black text-white">{totalHoy}</span>
         </div>
         <div className="bg-neutral-900 border border-emerald-900/50 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Check size={16} className="text-emerald-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Entregados</span>
            <span className="text-xl font-black text-emerald-400">{yaEntregados}</span>
         </div>
         <div className="bg-neutral-900 border border-orange-900/50 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Clock size={16} className="text-orange-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Pendientes</span>
            <span className="text-xl font-black text-orange-400">{faltaEntregar}</span>
         </div>
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <Flame size={16} className="text-orange-500 mb-1" />
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Por Salir</span>
            <span className="text-xl font-black text-white">{pedidosFaltantes.length}</span>
         </div>
         <button onClick={() => setShowExtraModal(true)} className="flex flex-col items-center justify-center bg-emerald-600 hover:bg-emerald-700 rounded-2xl p-3 text-white transition-all shadow-lg shadow-emerald-900/20">
            <Plus size={20} />
            <span className="text-[10px] uppercase font-black tracking-widest mt-1">Extra</span>
         </button>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center"><div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" /></div>
      ) : (
        <div className="flex flex-col gap-3 w-full max-w-4xl mx-auto pb-20 md:pb-0">

          {/* ── TOP ACCORDION 1: Por Pagar ── */}
          <TopAccordion id="porPagar" title="💳 Por Pagar" count={porPagarList.length} color="bg-orange-900/20 border-orange-900/40 text-orange-300">
            {/* Sub: Listos para entregar */}
            <SubAccordion id="listos" title="⏳ Listos para Entregar" count={listosParaEntregar.length}>
              {listosParaEntregar.length === 0 ? (
                <div className="p-4 text-center text-neutral-600 text-sm">Nada listo aún</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                  {listosParaEntregar.map(p => (
                    <div key={p.id} className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 flex justify-between items-center">
                      <div className="flex-1">
                        <h4 className="font-bold text-emerald-400 text-sm">{p.beneficiario}</h4>
                        <p className="text-xs text-neutral-500 mt-0.5">{detalleText(p)}</p>
                      </div>
                      <button onClick={() => marcarEntregado(p.id!, p.estado_entrega!)} className="ml-3 w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500">
                        <Truck size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SubAccordion>

            {/* Sub: Arroces */}
            <SubAccordion id="arroces" title="🍚 Solo Arroces" count={sArroces.length}>
              <OrderRows orders={sArroces} />
            </SubAccordion>

            {/* Sub: Snacks */}
            <SubAccordion id="snacks" title="🍦 Solo Bolis / Snacks" count={sSnacks.length}>
              <OrderRows orders={sSnacks} />
            </SubAccordion>

            {/* Sub: Sopas */}
            <SubAccordion id="sopas" title="🍲 Solo Sopas" count={sSopas.length}>
              <OrderRows orders={sSopas} />
            </SubAccordion>

            {/* Sub: Restaurante */}
            <SubAccordion
              id="restaurante"
              title="🍽️ Restaurante / Mixtos"
              count={sRestaurante.length}
              extraAction={isToday && (
                <button onClick={e => { e.stopPropagation(); setShowExtraModal(true); }} className="bg-blue-600/80 text-white text-[9px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1">
                  <Plus size={11} /> Extra
                </button>
              )}
            >
              <OrderRows orders={sRestaurante} />
            </SubAccordion>
          </TopAccordion>

          {/* ── TOP ACCORDION 2: Pagados ── */}
          <TopAccordion id="pagados" title="✅ Pagados" count={pagadosList.length} color="bg-emerald-900/20 border-emerald-900/40 text-emerald-300">
            <div className="bg-neutral-950/50 border border-neutral-800 rounded-2xl overflow-hidden">
              <OrderRows orders={pagadosList} />
            </div>
          </TopAccordion>

        </div>
      )}

      {/* Modal: Extra */}
      {showExtraModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowExtraModal(false)} className="absolute top-4 right-4 text-neutral-500"><X size={24} /></button>
            <h2 className="text-2xl font-black mb-6">Añadir Extra</h2>
            <div className="space-y-4">
              <select className="w-full bg-neutral-950 text-white rounded-xl px-4 py-3 border border-neutral-800" value={extraProteina} onChange={e => setExtraProteina(e.target.value)}><option value="">Proteína</option>{menuConfig.proteinas.map(p => <option key={p} value={p}>{p}</option>)}</select>
              <select className="w-full bg-neutral-950 text-white rounded-xl px-4 py-3 border border-neutral-800" value={extraSopa} onChange={e => setExtraSopa(e.target.value)}><option value="">Sopa</option><option value="Sin Sopa">Ninguna</option>{menuConfig.sopas.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <button onClick={crearPorcionExtra} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl mt-4">Crear Stock</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminar */}
      {pedidoToDelete && (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center max-w-sm">
            <Trash2 size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-6">¿Eliminar pedido?</h2>
            <div className="flex gap-3">
              <button onClick={() => setPedidoToDelete(null)} className="flex-1 py-3 bg-neutral-800 rounded-xl">No</button>
              <button onClick={confirmarEliminarPedido} className="flex-1 py-3 bg-red-600 rounded-xl">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



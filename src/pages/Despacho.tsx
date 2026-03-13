import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Truck, Calendar, Trash2, Edit2, Search, CheckSquare, Plus, X, Flame } from 'lucide-react';
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
    
    // Si intentamos marcar como pagado y el pedido tiene responsable (va a cuenta corriente)
    if (nuevoEstado && p.responsable_id) {
      const { error: errPago } = await supabase.from('pagos').insert([{ 
        cliente_id: p.responsable_id, 
        monto: p.valor, 
        metodo: 'Efectivo' 
      }]);
      
      // Si el pago falla (ej. error de internet o restricción de base de datos), abortamos
      if (errPago) {
         console.error("Error al registrar el pago en despacho:", errPago);
         alert("Hubo un error al registrar el pago: " + errPago.message);
         return;
      }
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

  const eliminarPedido = (id: string) => {
    setPedidoToDelete(id);
  };

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
    if (!extraProteina) return alert('Debes seleccionar al menos la proteína.');
    const nuevoPedido = {
      beneficiario: 'Porción Extra (Stock)',
      detalle: { proteina: extraProteina, sopa: extraSopa === 'Sin Sopa' ? null : extraSopa, acompanamientos: [], cantidades: {}, nota: 'Creado en Despacho', esSnack: false },
      valor: 14000, pagado: false, estado_cocina: 'empacado', estado_entrega: 'en_espera'
    };
    const { error } = await supabase.from('pedidos').insert([nuevoPedido]);
    if (!error) { setShowExtraModal(false); setExtraProteina(''); setExtraSopa(''); fetchPedidosPorFecha(); }
    else alert('Error al crear porción extra');
  };

  // ── Classify orders ──
  // Multi-item (items array) → always restaurante
  // Arroz especial (tipoPlato='arroz') → restaurante 
  // Explicit snack (tipoPlato='snack') → snack
  // Heuristic (no acomp, no sopa, non-standard protein) → snack
  const esSnackDirecto = (p: Pedido) => {
    if ((p.detalle as any)?.items) return false;
    if (p.detalle.tipoPlato === 'arroz') return false;
    if (p.detalle.tipoPlato === 'snack') return true;
    return (
      p.detalle.acompanamientos.length === 0 &&
      !p.detalle.sopa &&
      !!p.detalle.proteina &&
      !['Pechuga', 'Alitas', 'Cerdo', 'Res', 'Solo Sopa'].includes(p.detalle.proteina ?? '')
    );
  };

  // Helper: get short detalle description
  const detalleText = (p: Pedido) => {
    const d = p.detalle as any;
    if (d?.items) return `${d.items.length} ítems: ${d.items.map((i: any) => i.proteina).join(', ')}`;
    if (p.detalle.proteina) {
      let t = p.detalle.proteina;
      if (p.detalle.acompanamientos?.length) t += ' + ' + p.detalle.acompanamientos.join(', ');
      return t;
    }
    return '';
  };

  const isToday = fecha === getColombiaDateString();
  const pedidosFiltrados = pedidos.filter(p => p.beneficiario?.toLowerCase().includes(searchTerm.toLowerCase()));
  const pedidosRestaurante = pedidosFiltrados.filter(p => !esSnackDirecto(p));
  const pedidosSnacks = pedidosFiltrados.filter(p => esSnackDirecto(p));
  const listosParaEntregar = pedidosRestaurante.filter(p => p.estado_cocina === 'empacado' && p.estado_entrega === 'en_espera');
  const totalDespachar = pedidosRestaurante.length;
  const entregados = pedidosRestaurante.filter(p => p.estado_entrega === 'entregado').length;
  const porEntregar = totalDespachar - entregados;

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100 gap-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 text-blue-500 rounded-2xl"><Truck size={28} /></div>
          <div><h2 className="text-2xl font-bold">Despacho y Entregas</h2><p className="text-neutral-400 text-sm">Auditoría diaria y despachos</p></div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl">
          <div className="relative w-full md:w-48">
            <Search size={18} className="absolute left-3 top-3 text-neutral-500" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar Cliente..." className="w-full bg-neutral-950 text-white rounded-xl py-2 pl-10 pr-4 outline-none border border-neutral-800 focus:border-neutral-600" />
          </div>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={20} className="text-neutral-500" />
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-transparent text-white outline-none border-none py-2" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center"><div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div></div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-20 md:pb-0">

          {/* Dashboard */}
          {isToday && (
            <div className="grid grid-cols-3 gap-3 w-full">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow-xl flex flex-col items-center justify-center text-center"><Flame size={18} className="text-blue-500 mb-1" /><span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Total a Despachar</span><span className="text-2xl font-black text-white">{totalDespachar}</span></div>
              <div className="bg-neutral-900 border border-emerald-900/50 rounded-2xl p-3 shadow-xl flex flex-col items-center justify-center text-center"><CheckSquare size={18} className="text-emerald-500 mb-1" /><span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Entregados</span><span className="text-2xl font-black text-emerald-400">{entregados}</span></div>
              <div className="bg-neutral-900 border border-red-900/50 rounded-2xl p-3 shadow-xl flex flex-col items-center justify-center text-center"><Truck size={18} className="text-orange-500 mb-1" /><span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Por Entregar</span><span className="text-2xl font-black text-orange-400">{porEntregar}</span></div>
            </div>
          )}

          {/* Listos para Entregar */}
          {isToday && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4 ml-2">
                <h3 className="text-lg uppercase tracking-wider font-bold text-neutral-400">⏳ Listos Para Entregar ({listosParaEntregar.length})</h3>
                <button onClick={() => setShowExtraModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg transition-transform hover:scale-105"><Plus size={16} /> Añadir Porción Extra</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {listosParaEntregar.map(p => (
                  <div key={p.id} className="bg-emerald-950/20 border border-emerald-900/50 rounded-2xl p-4 flex justify-between items-center hover:from-emerald-900/20 transition-all shadow-xl shadow-emerald-900/5">
                    <div className="flex-1">
                      <h4 className="font-bold text-xl text-emerald-400 mb-1">{p.beneficiario}</h4>
                      <p className="text-sm text-neutral-400 line-clamp-2">{detalleText(p)}</p>
                      {!(p.detalle as any)?.items && p.detalle.sopa && (<div className="mt-1 flex items-center gap-1 text-orange-400 font-black text-xs uppercase"><span className="text-lg">🍲</span> {p.detalle.sopa}</div>)}
                      {!(p.detalle as any)?.items && p.detalle.nota && (<div className="mt-1 text-yellow-400 text-xs font-medium italic">⚠️ Nota: {p.detalle.nota}</div>)}
                      <div className="mt-2 flex gap-2">
                        <span className={`text-xs px-2 py-1 rounded-md font-bold shrink-0 ${p.pagado ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>{p.pagado ? 'Pagado' : 'Deuda'}</span>
                        {(p as any).clientes?.nombre && (<span className="text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 truncate max-w-[140px]">Resp: {(p as any).clientes?.nombre}</span>)}
                      </div>
                    </div>
                    <button onClick={() => marcarEntregado(p.id!, p.estado_entrega!)} className="ml-4 w-16 h-16 md:w-auto md:h-auto md:px-6 md:py-3 rounded-2xl bg-emerald-600 text-white font-bold flex justify-center items-center gap-2 hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-600/30">
                      <CheckSquare size={24} /> <span className="hidden md:block">Entregar</span>
                    </button>
                  </div>
                ))}
                {listosParaEntregar.length === 0 && (<div className="col-span-full border-2 border-dashed border-neutral-800 rounded-2xl p-8 text-center text-neutral-500">No hay pedidos empacados pendientes de entrega.</div>)}
              </div>
            </div>
          )}

          {/* Historial Restaurante */}
          <div>
            <h3 className="text-lg uppercase tracking-wider font-bold text-neutral-400 mb-4 ml-2">📜 Historial de Restaurante ({pedidosRestaurante.length})</h3>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-800">
                  <thead className="bg-neutral-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Beneficiario</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Detalle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Responsable</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Cocina</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Valor / Pago</th>
                      {isToday && (<th className="px-6 py-3 text-right text-xs font-medium text-neutral-400 uppercase tracking-wider">Entrega</th>)}
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-400 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {pedidosRestaurante.map(p => {
                      const ptg = p.pagado ? 'text-blue-400' : 'text-orange-400';
                      const cocinaColor = p.estado_cocina === 'empacado' ? 'text-emerald-400' : 'text-yellow-400';
                      return (
                        <tr key={p.id} className="hover:bg-neutral-800 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingId === p.id ? (
                              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => guardarEdicion(p.id!)} onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(p.id!); if (e.key === 'Escape') setEditingId(null); }} className="bg-neutral-700 text-white rounded-md px-2 py-1 w-full" autoFocus />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{p.beneficiario}</span>
                                {isToday && (<button onClick={() => { setEditingId(p.id!); setEditName(p.beneficiario || ''); }} className="text-neutral-500 hover:text-blue-400"><Edit2 size={16} /></button>)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-neutral-200">
                              {(p.detalle as any)?.items ? (
                                <span><span className="text-xs text-orange-400 font-bold">{(p.detalle as any).items.length} ítems: </span>{(p.detalle as any).items.map((it: any) => it.proteina).join(', ')}</span>
                              ) : (
                                <span>{p.detalle.proteina}{p.detalle.acompanamientos?.length ? ' + ' + p.detalle.acompanamientos.join(', ') : ''}</span>
                              )}
                            </div>
                            {!(p.detalle as any)?.items && p.detalle.sopa && (<div className="text-[10px] font-black text-orange-500 uppercase flex items-center gap-1 mt-0.5">🍲 {p.detalle.sopa}</div>)}
                            {!(p.detalle as any)?.items && p.detalle.nota && (<div className="text-[11px] text-yellow-400 italic mt-1 max-w-[200px] truncate" title={p.detalle.nota}>⚠️ Nota: {p.detalle.nota}</div>)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-neutral-400">
                            <select className="bg-neutral-800 border border-neutral-700 rounded p-1 text-xs outline-none text-neutral-300 focus:border-blue-500 max-w-[120px]" value={p.responsable_id || 'null'} onChange={(e) => asignarResponsable(p.id!, e.target.value)}>
                              <option value="null">Sin Cuenta (Efectivo)</option>
                              {clientes.map(c => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                            </select>
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap font-bold ${cocinaColor}`}>{p.estado_cocina === 'empacado' ? 'Empacado' : 'En Proceso'}</td>
                          <td className={`px-6 py-4 font-bold ${ptg}`}>
                            {editingPrecioId === p.id ? (
                              <input type="number" className="w-20 bg-neutral-800 text-white rounded px-1 text-sm font-bold border border-blue-500" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} autoFocus onBlur={() => guardarNuevoPrecio(p.id!)} onKeyDown={e => e.key === 'Enter' && guardarNuevoPrecio(p.id!)} />
                            ) : (
                              <div className="cursor-pointer hover:text-blue-400 inline-block" onClick={() => { setEditingPrecioId(p.id!); setNuevoPrecio(p.valor); }}>${p.valor.toLocaleString()}</div>
                            )}
                            <div className="mt-1">
                              {isToday && (<button onClick={() => togglePagado(p)} className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors ${p.pagado ? 'bg-blue-500/20 text-blue-400 hover:bg-neutral-800' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white'}`}>{p.pagado ? 'Pagado (Deshacer)' : 'Cobrar Ahora'}</button>)}
                              {!isToday && !p.pagado && <span className="text-orange-500 text-xs">(Deuda)</span>}
                            </div>
                          </td>
                          {isToday && (
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => p.estado_entrega === 'entregado' ? marcarEntregado(p.id!, 'entregado') : marcarEntregado(p.id!, 'en_espera')} className={`px-3 py-1 rounded-xl text-xs font-bold transition-all active:scale-95 ${p.estado_entrega === 'entregado' ? 'bg-neutral-800 text-neutral-400 hover:text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>{p.estado_entrega === 'entregado' ? 'Deshacer' : 'Entregado'}</button>
                            </td>
                          )}
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {isToday && (<button onClick={() => eliminarPedido(p.id!)} className="text-neutral-500 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>)}
                          </td>
                        </tr>
                      );
                    })}
                    {pedidosRestaurante.length === 0 && (<tr><td colSpan={7} className="px-6 py-12 text-center text-neutral-500">No hay registros en esta fecha.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Historial Snacks */}
          {pedidosSnacks.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg uppercase tracking-wider font-bold text-cyan-400 mb-4 ml-2 flex items-center gap-2">🍦 Historial de Snacks y Extras ({pedidosSnacks.length})</h3>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-800">
                    <thead className="bg-neutral-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Beneficiario</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Snack / Extra</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Responsable</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Valor / Pago</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-neutral-400 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {pedidosSnacks.map(p => {
                        const ptg = p.pagado ? 'text-blue-400' : 'text-orange-400';
                        return (
                          <tr key={p.id} className="hover:bg-neutral-800 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              {editingId === p.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => guardarEdicion(p.id!)} onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(p.id!); if (e.key === 'Escape') setEditingId(null); }} className="bg-neutral-700 text-white rounded-md px-2 py-1 w-full" autoFocus />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-white">{p.beneficiario || 'Cliente Directo'}</span>
                                  {isToday && (<button onClick={() => { setEditingId(p.id!); setEditName(p.beneficiario || ''); }} className="text-neutral-500 hover:text-blue-400"><Edit2 size={16} /></button>)}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-cyan-400">{p.detalle.proteina}</div>
                              {p.detalle.nota && (<div className="text-[11px] text-yellow-400 italic mt-1 max-w-[200px] truncate" title={p.detalle.nota}>⚠️ {p.detalle.nota}</div>)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <select className="bg-neutral-800 border border-neutral-700 rounded p-1 text-xs outline-none text-neutral-300 focus:border-blue-500 max-w-[120px]" value={p.responsable_id || 'null'} onChange={(e) => asignarResponsable(p.id!, e.target.value)}>
                                <option value="null">Sin Cuenta (Efectivo)</option>
                                {clientes.map(c => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                              </select>
                            </td>
                            <td className={`px-6 py-4 font-bold ${ptg}`}>
                              {editingPrecioId === p.id ? (
                                <input type="number" className="w-20 bg-neutral-800 text-white rounded px-1 text-sm font-bold border border-blue-500" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} autoFocus onBlur={() => guardarNuevoPrecio(p.id!)} onKeyDown={e => e.key === 'Enter' && guardarNuevoPrecio(p.id!)} />
                              ) : (
                                <div className="cursor-pointer hover:text-blue-400 inline-block" onClick={() => { setEditingPrecioId(p.id!); setNuevoPrecio(p.valor); }}>${p.valor.toLocaleString()}</div>
                              )}
                              <div className="mt-1">
                                {isToday && (<button onClick={() => togglePagado(p)} className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors ${p.pagado ? 'bg-blue-500/20 text-blue-400 hover:bg-neutral-800' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white'}`}>{p.pagado ? 'Pagado (Deshacer)' : 'Cobrar Ahora'}</button>)}
                                {!isToday && !p.pagado && <span className="text-orange-500 text-xs">(Deuda)</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              {isToday && (<button onClick={() => eliminarPedido(p.id!)} className="text-neutral-500 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Añadir Porción Extra */}
      {showExtraModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setShowExtraModal(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white"><X size={24} /></button>
            <h2 className="text-2xl font-black text-white mb-6">Añadir Porción Extra</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-wide">Proteína <span className="text-red-500">*</span></label>
                <select className="w-full bg-neutral-950 text-white rounded-xl px-4 py-3 outline-none border border-neutral-800 focus:border-blue-500" value={extraProteina} onChange={(e) => setExtraProteina(e.target.value)}>
                  <option value="">Seleccione Proteína</option>
                  {menuConfig.proteinas.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-wide">Sopa (Opcional)</label>
                <select className="w-full bg-neutral-950 text-white rounded-xl px-4 py-3 outline-none border border-neutral-800 focus:border-blue-500" value={extraSopa} onChange={(e) => setExtraSopa(e.target.value)}>
                  <option value="">Seleccione Sopa</option>
                  <option value="Sin Sopa">Ninguna</option>
                  {menuConfig.sopas.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div className="pt-4 border-t border-neutral-800 mt-6">
                <button onClick={crearPorcionExtra} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-4 rounded-xl flex justify-center items-center gap-2 transition-transform hover:scale-105"><Plus size={20} /> Crear Extra en Stock</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar Pedido */}
      {pedidoToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative text-center animate-fade-in">
            <div className="mx-auto w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-black text-white mb-2">Eliminar Pedido</h2>
            <p className="text-neutral-400 text-sm mb-6">
              ¿Estás seguro de que deseas eliminar este pedido permanentemente? Esta acción no se puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setPedidoToDelete(null)}
                className="py-3 rounded-xl font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarEliminarPedido}
                className="py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30"
                disabled={loading}
              >
                {loading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

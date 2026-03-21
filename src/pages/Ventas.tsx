import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOrderStore, MENU_CONFIG_ID, type Cliente, type ArrozEspecialItem, type ItemPedido, type PedidoDetalle } from '../store/orderStore';
import { User, Search, Plus, Save, Settings2, Pencil, CheckCircle2, Trash2, ShoppingCart } from 'lucide-react';

type ATab = 'Restaurante' | 'Snacks' | 'Especiales';

// Fuzzy: strip accents + teacher titles so "Héctor" matches "Hector" and "Profesor Juan" matches "Juan"
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/\b(profesor|profesora|profe|prof|profr|se[nñ]o|se[nñ]ora|se[nñ]or|doctor|doctora|dra?|sr[a]?)\b/gi, '')
   .replace(/\s+/g, ' ').trim();
const clienteMatches = (nombre: string, q: string) => norm(nombre).includes(norm(q));

export default function Ventas() {
  const store = useOrderStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<ATab>('Restaurante');
  const [snackQtys, setSnackQtys] = useState<Record<string, number>>({});
  const [pedidosRecientes, setPedidosRecientes] = useState<any[]>([]);
  const [ultimoPedidoCliente, setUltimoPedidoCliente] = useState<{ responsable: Cliente | null; beneficiario: string } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrozPorcion, setArrozPorcion] = useState<Record<string, 'pequeña' | 'grande'>>({});
  const [arrozCantidad, setArrozCantidad] = useState<Record<string, number>>({});
  const [newProteina, setNewProteina] = useState('');
  const [newAcomp, setNewAcomp] = useState('');
  const [newSopa, setNewSopa] = useState('');
  const [newExtra, setNewExtra] = useState('');
  const [newExtraPrecio, setNewExtraPrecio] = useState('');
  const [newArrozNombre, setNewArrozNombre] = useState('');
  const [newArrozPrecioS, setNewArrozPrecioS] = useState('');
  const [newArrozPrecioL, setNewArrozPrecioL] = useState('');

  const updSnackQty = (s: string, d: number) => setSnackQtys(p => ({ ...p, [s]: Math.max(1, (p[s] || 1) + d) }));
  const updArrozCant = (n: string, d: number) => setArrozCantidad(p => ({ ...p, [n]: Math.max(1, (p[n] || 1) + d) }));

  useEffect(() => { fetchClientes(); fetchPedidosRecientes(); }, []);
  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    if (data) setClientes((data as Cliente[]).filter(c => c.id !== MENU_CONFIG_ID));
  };

  const fetchPedidosRecientes = async () => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const { data } = await supabase.from('pedidos').select('*').gte('created_at', s.toISOString()).eq('estado_cocina', 'pendiente').order('created_at', { ascending: false });
    if (data) setPedidosRecientes(data);
  };

  const crearCliente = async () => {
    if (!nuevoCliente) return;
    setLoadingConfig(true);
    const { data } = await supabase.from('clientes').insert([{ nombre: nuevoCliente, es_frecuente: true }]).select().single();
    if (data) { setClientes(prev => [...prev, data as Cliente]); store.setResponsable(data as Cliente); setShowClienteForm(false); setNuevoCliente(''); }
    setLoadingConfig(false);
  };

  const agregarOtroPedido = () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (ultimoPedidoCliente) { useOrderStore.setState({ responsable: ultimoPedidoCliente.responsable, beneficiario: ultimoPedidoCliente.beneficiario, carrito: [], detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] }, valorBase: 0, precioManual: false, editingPedidoId: null }); setSearch(ultimoPedidoCliente.responsable?.nombre || ''); }
    setUltimoPedidoCliente(null);
    setActiveTab('Restaurante');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nuevoPedidoDiferente = () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); setUltimoPedidoCliente(null); store.resetOrder(); setSearch(''); };

  const hayItemActual = !!store.detalle.proteina;
  const totalCarrito = store.carrito.reduce((s, i) => s + i.valor, 0);
  const totalPedido = totalCarrito + (hayItemActual ? store.valorBase : 0);
  const numItems = store.carrito.length + (hayItemActual ? 1 : 0);

  const labelItem = (item: ItemPedido) => {
    if (item.tipoPlato === 'arroz' || item.tipoPlato === 'snack') return item.proteina || '-';
    let l = item.proteina || '-';
    if (item.sopa) l += ` + ${item.sopa}`;
    if (item.acompanamientos.length) l += ` (${item.acompanamientos.join(', ')})`;
    return l;
  };

  const handleSubmit = async () => {
    const itemsFinales: ItemPedido[] = [...store.carrito];
    if (hayItemActual) itemsFinales.push({ 
      proteina: store.detalle.proteina, 
      acompanamientos: store.detalle.acompanamientos, 
      sopa: store.detalle.sopa, 
      extras: store.detalle.extras, 
      nota: store.detalle.nota, 
      tipoPlato: store.detalle.tipoPlato, 
      valor: store.valorBase,
      cantidad: 1,
      completado: false
    });
    if (itemsFinales.length === 0) { alert("Agrega al menos una comida."); return; }
    if (!store.responsable && !store.beneficiario.trim()) { alert("Selecciona un cliente o ingresa el beneficiario."); return; }
    setSaving(true);

    const valor = itemsFinales.reduce((s, i) => s + i.valor, 0);
    let detalleEnviar: PedidoDetalle;
    if (itemsFinales.length === 1) {
      const it = itemsFinales[0];
      detalleEnviar = { 
        proteina: it.proteina, 
        acompanamientos: it.acompanamientos, 
        sopa: it.sopa, 
        extras: it.extras, 
        nota: it.nota, 
        tipoPlato: it.tipoPlato,
        mediaSopa: it.mediaSopa 
      };
    } else {
      detalleEnviar = { proteina: itemsFinales.map(i => i.proteina).filter(Boolean).join(' + '), acompanamientos: [], sopa: null, extras: [], items: itemsFinales };
    }
    const todosSnacks = itemsFinales.every(i => i.tipoPlato === 'snack');
    const orderData = { responsable_id: store.responsable?.id || null, beneficiario: store.beneficiario.trim() || store.responsable?.nombre || '', detalle: detalleEnviar, valor, estado_cocina: todosSnacks ? 'empacado' : 'pendiente', estado_entrega: 'en_espera', pagado: false };

    if (store.editingPedidoId) {
      const { error } = await supabase.from('pedidos').update({ responsable_id: orderData.responsable_id, beneficiario: orderData.beneficiario, detalle: orderData.detalle, valor: orderData.valor }).eq('id', store.editingPedidoId);
      setSaving(false);
      if (error) alert("Error: " + error.message); else { store.resetOrder(); setSearch(''); fetchPedidosRecientes(); alert("¡Pedido actualizado!"); }
      return;
    }

    const { error } = await supabase.from('pedidos').insert([orderData]);
    setSaving(false);
    if (error) { alert("Error: " + error.message); } else {
      const snap = { responsable: store.responsable, beneficiario: store.beneficiario.trim() };
      store.resetOrder();
      setUltimoPedidoCliente(snap);
      fetchPedidosRecientes();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => { setUltimoPedidoCliente(null); setSearch(''); }, 8000);
    }
  };

  const cargarParaEdicion = (p: any) => {
    const items: ItemPedido[] | undefined = p.detalle?.items;
    if (items && items.length > 0) {
      useOrderStore.setState({ editingPedidoId: p.id, responsable: clientes.find(c => c.id === p.responsable_id) || null, beneficiario: p.beneficiario || '', carrito: items, detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] }, valorBase: 0, precioManual: false });
    } else {
      useOrderStore.setState({ editingPedidoId: p.id, responsable: clientes.find(c => c.id === p.responsable_id) || null, beneficiario: p.beneficiario || '', carrito: [], detalle: p.detalle, valorBase: p.valor, precioManual: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isArrozSelected = (arroz: ArrozEspecialItem) => {
    const porcion = arrozPorcion[arroz.nombre] || 'pequeña';
    const cant = arrozCantidad[arroz.nombre] || 1;
    const tag = cant > 1 ? `${cant}x ${arroz.nombre} ${porcion}` : `${arroz.nombre} ${porcion}`;
    return store.detalle.proteina === tag && store.detalle.tipoPlato === 'arroz';
  };

  const seleccionarArroz = (arroz: ArrozEspecialItem) => {
    const porcion = arrozPorcion[arroz.nombre] || 'pequeña';
    const cant = arrozCantidad[arroz.nombre] || 1;
    const precio = porcion === 'pequeña' ? arroz.precioSmall : arroz.precioLarge;
    const tag = cant > 1 ? `${cant}x ${arroz.nombre} ${porcion}` : `${arroz.nombre} ${porcion}`;
    store.setArrozEspecial(tag, precio * cant);
  };

  const nombreCliente = ultimoPedidoCliente?.beneficiario || ultimoPedidoCliente?.responsable?.nombre || 'el docente';

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-2 md:p-6 text-neutral-100">

      {/* Banner Multi-Pedido */}
      {ultimoPedidoCliente && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className="bg-emerald-950 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3"><CheckCircle2 size={24} className="text-emerald-400 shrink-0" /><div><p className="font-black text-emerald-300">¡Pedido enviado!</p><p className="text-sm text-emerald-500/80">¿Nuevo pedido para <span className="font-bold text-emerald-300">{nombreCliente}</span>?</p></div></div>
            <div className="flex gap-3">
              <button onClick={agregarOtroPedido} className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl text-sm"><Plus size={18} /> Para {nombreCliente.split(' ')[0]}</button>
              <button onClick={nuevoPedidoDiferente} className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-2xl text-sm">Nuevo cliente</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Constructor ── */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-3xl p-4 md:p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4">
          <div className="flex bg-neutral-950 p-1 rounded-2xl gap-1">
            {(['Restaurante', 'Especiales', 'Snacks'] as ATab[]).map(tab => {
              const c: Record<ATab, string> = { Restaurante: 'bg-orange-500', Especiales: 'bg-yellow-500', Snacks: 'bg-cyan-500' };
              return (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === tab ? `${c[tab]} text-white` : 'text-neutral-500 hover:text-white'}`}>{tab === 'Especiales' ? '🍚 Arroces' : tab}</button>);
            })}
          </div>
          <div className="flex gap-2">
            {store.editingPedidoId && (<button onClick={() => { store.resetOrder(); setSearch(''); }} className="px-4 py-2 bg-red-500/20 text-red-500 font-bold rounded-xl text-sm">Cancelar Ed.</button>)}
            <button onClick={() => setShowConfig(!showConfig)} className="p-3 bg-neutral-800 text-neutral-400 rounded-xl hover:text-white"><Settings2 size={24} /></button>
          </div>
        </div>

        {/* Config */}
        {showConfig && (
          <div className="mb-8 p-4 bg-black/40 border border-neutral-800 rounded-2xl">
            <h3 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2"><Pencil size={18}/> Editar Menú</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 text-sm">
              <div><h4 className="text-neutral-500 mb-2">Proteínas y Precios</h4><div className="flex flex-col gap-1 mb-2">{store.menuConfig.proteinas.map(p => (<div key={p} className="bg-neutral-800 px-2 py-1 rounded flex items-center justify-between text-xs"><span>{p}</span><div className="flex items-center gap-1"><span className="text-neutral-500">$</span><input type="number" value={store.menuConfig.preciosProteinas[p] || 0} onChange={e => store.setMenuConfig({ preciosProteinas: { ...store.menuConfig.preciosProteinas, [p]: Number(e.target.value) } })} className="w-12 bg-transparent border-b border-neutral-700 outline-none text-right" /><button className="text-red-400 ml-1" onClick={() => store.setMenuConfig({ proteinas: store.menuConfig.proteinas.filter(x => x !== p) })}>x</button></div></div>))}</div><div className="flex gap-1"><input value={newProteina} onChange={e => setNewProteina(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Nueva..." /><button onClick={() => { if (newProteina) { store.setMenuConfig({ proteinas: [...store.menuConfig.proteinas, newProteina], preciosProteinas: { ...store.menuConfig.preciosProteinas, [newProteina]: 13000 } }); setNewProteina(''); } }} className="bg-neutral-800 px-2 rounded">+</button></div></div>
              <div><h4 className="text-neutral-500 mb-2">Acompañamientos</h4><div className="flex flex-wrap gap-1 mb-2">{store.menuConfig.acompanamientos.map(a => (<span key={a} className="bg-neutral-800 px-2 py-1 rounded flex items-center gap-1 text-xs">{a}<button className="text-red-400 ml-1" onClick={() => store.setMenuConfig({ acompanamientos: store.menuConfig.acompanamientos.filter(x => x !== a) })}>x</button></span>))}</div><div className="flex gap-1"><input value={newAcomp} onChange={e => setNewAcomp(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Nuevo..." /><button onClick={() => { if (newAcomp) { store.setMenuConfig({ acompanamientos: [...store.menuConfig.acompanamientos, newAcomp] }); setNewAcomp(''); } }} className="bg-neutral-800 px-2 rounded">+</button></div></div>
              <div><h4 className="text-neutral-500 mb-2">Sopas</h4><div className="flex flex-wrap gap-1 mb-2">{store.menuConfig.sopas.map(s => (<span key={s} className="bg-neutral-800 px-2 py-1 rounded flex items-center gap-1 text-xs">{s}<button className="text-red-400 ml-1" onClick={() => store.setMenuConfig({ sopas: store.menuConfig.sopas.filter(x => x !== s) })}>x</button></span>))}</div><div className="flex gap-1"><input value={newSopa} onChange={e => setNewSopa(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Nueva..." /><button onClick={() => { if (newSopa) { store.setMenuConfig({ sopas: [...store.menuConfig.sopas, newSopa] }); setNewSopa(''); } }} className="bg-neutral-800 px-2 rounded">+</button></div><div className="mt-4 pt-2 border-t border-neutral-800"><h4 className="text-neutral-500 mb-1 text-[10px] uppercase">Valor Sopa Adicional</h4><div className="flex items-center gap-1"><span className="text-neutral-500 text-xs">$</span><input type="number" value={store.menuConfig.precioSopaAdicional || 0} onChange={e => store.setMenuConfig({ precioSopaAdicional: Number(e.target.value) })} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" /></div></div></div>
              <div><h4 className="text-neutral-500 mb-2">Adicionales</h4><div className="flex flex-col gap-1 mb-2">{store.menuConfig.extras.map(e => (<span key={e.nombre} className="bg-neutral-800 px-2 py-1 rounded flex items-center justify-between text-xs"><span>{e.nombre} (${e.precio})</span><button className="text-red-400 ml-1" onClick={() => store.setMenuConfig({ extras: store.menuConfig.extras.filter(x => x.nombre !== e.nombre) })}>x</button></span>))}</div><div className="flex flex-col gap-1"><input value={newExtra} onChange={e => setNewExtra(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Extra..." /><div className="flex gap-1"><input type="number" value={newExtraPrecio} onChange={e => setNewExtraPrecio(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Valor..." /><button onClick={() => { if (newExtra && newExtraPrecio) { store.setMenuConfig({ extras: [...store.menuConfig.extras, { nombre: newExtra, precio: Number(newExtraPrecio) }] }); setNewExtra(''); setNewExtraPrecio(''); } }} className="bg-neutral-800 px-2 rounded">+</button></div></div></div>
              <div><h4 className="text-neutral-500 mb-2">Snacks</h4><div className="flex flex-col gap-1 mb-2">{store.menuConfig.snacks?.map(s => (<span key={s.nombre} className="bg-neutral-800 px-2 py-1 rounded flex items-center justify-between text-xs"><span>{s.nombre} (${s.precio})</span><button className="text-red-400 ml-1" onClick={() => store.setMenuConfig({ snacks: store.menuConfig.snacks.filter(x => x.nombre !== s.nombre) })}>x</button></span>))}</div><div className="flex flex-col gap-1"><input id="nSN" className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Snack..." /><div className="flex gap-1"><input id="nSP" type="number" className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Valor..." /><button onClick={() => { const n=(document.getElementById('nSN') as HTMLInputElement); const p=(document.getElementById('nSP') as HTMLInputElement); if(n.value&&p.value){store.setMenuConfig({snacks:[...(store.menuConfig.snacks||[]),{nombre:n.value,precio:Number(p.value),desc:''}]});n.value='';p.value='';} }} className="bg-neutral-800 px-2 rounded">+</button></div></div></div>
              <div><h4 className="text-neutral-500 mb-2">🍚 Arroces</h4><div className="flex flex-col gap-1 mb-2">{store.menuConfig.arrozEspeciales?.map(a => (<span key={a.nombre} className="bg-neutral-800 px-2 py-1 rounded flex items-center justify-between gap-1 text-xs"><span className="truncate">{a.nombre}</span><span className="text-neutral-500 shrink-0">${a.precioSmall}/{a.precioLarge}</span><button className="text-red-400 ml-1 shrink-0" onClick={() => store.setMenuConfig({ arrozEspeciales: store.menuConfig.arrozEspeciales.filter(x => x.nombre !== a.nombre) })}>x</button></span>))}</div><div className="flex flex-col gap-1"><input value={newArrozNombre} onChange={e => setNewArrozNombre(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="Nombre..." /><div className="flex gap-1"><input type="number" value={newArrozPrecioS} onChange={e => setNewArrozPrecioS(e.target.value)} className="w-1/2 bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="$Peq" /><input type="number" value={newArrozPrecioL} onChange={e => setNewArrozPrecioL(e.target.value)} className="w-1/2 bg-neutral-900 border border-neutral-700 rounded p-1 outline-none text-white text-xs" placeholder="$Gr" /></div><button onClick={() => { if(newArrozNombre&&newArrozPrecioS&&newArrozPrecioL){store.setMenuConfig({arrozEspeciales:[...(store.menuConfig.arrozEspeciales||[]),{nombre:newArrozNombre,precioSmall:Number(newArrozPrecioS),precioLarge:Number(newArrozPrecioL)}]});setNewArrozNombre('');setNewArrozPrecioS('');setNewArrozPrecioL('');} }} className="bg-yellow-700/40 text-yellow-300 px-2 py-1 rounded text-xs">+ Agregar</button></div></div>
            </div>
            {/* Menú del Día */}
            <div className="col-span-full border-t border-neutral-700/40 pt-4 mt-2">
              <div className="flex items-center gap-3 mb-3">
                <h4 className="text-neutral-400 font-bold text-sm">📢 Menú del Día (Banner en Ventas)</h4>
                <button
                  onClick={() => store.setMenuConfig({ menuDia: { titulo: store.menuConfig.menuDia?.titulo || '', descripcion: store.menuConfig.menuDia?.descripcion || '', precio: store.menuConfig.menuDia?.precio, activo: !store.menuConfig.menuDia?.activo } })}
                  className={`px-3 py-0.5 rounded-full text-xs font-black transition-colors ${store.menuConfig.menuDia?.activo ? 'bg-emerald-500/30 text-emerald-400' : 'bg-neutral-700 text-neutral-500 hover:text-white'}`}
                >{store.menuConfig.menuDia?.activo ? '✓ Visible' : 'Oculto'}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input className="col-span-2 bg-neutral-900 border border-neutral-700 rounded-lg p-2 outline-none text-white text-xs" placeholder="Títulodel día (ej: Sopa de Res + Pechuga Asada)" value={store.menuConfig.menuDia?.titulo || ''} onChange={e => store.setMenuConfig({ menuDia: { ...store.menuConfig.menuDia!, titulo: e.target.value } })} />
                <input className="bg-neutral-900 border border-neutral-700 rounded-lg p-2 outline-none text-white text-xs" placeholder="Descripción (ej: incluye arroz y ensalada)" value={store.menuConfig.menuDia?.descripcion || ''} onChange={e => store.setMenuConfig({ menuDia: { ...store.menuConfig.menuDia!, descripcion: e.target.value } })} />
                <input type="number" className="bg-neutral-900 border border-neutral-700 rounded-lg p-2 outline-none text-white text-xs" placeholder="Precio (opcional)" value={store.menuConfig.menuDia?.precio ?? ''} onChange={e => store.setMenuConfig({ menuDia: { ...store.menuConfig.menuDia!, precio: e.target.value ? Number(e.target.value) : undefined } })} />
              </div>
            </div>
          </div>
        )}

        {/* TAB: Restaurante */}
        {activeTab === 'Restaurante' && (
          <div>
            <div className="mb-8"><h3 className="text-sm font-semibold text-neutral-400 mb-3 uppercase tracking-wider">1. Proteína</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{store.menuConfig.proteinas.map((p: string) => (<button key={p} onClick={() => store.setProteina(p)} className={`py-4 px-2 rounded-2xl text-lg font-medium transition-all active:scale-95 border-2 ${store.detalle.proteina === p && !store.detalle.tipoPlato ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-neutral-800 border-transparent text-neutral-300 hover:bg-neutral-700'}`}>{p}</button>))}</div></div>
            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">2. Acompañamientos</h3>
              <button 
                onClick={() => store.setPlatoCompleto()}
                className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-4 py-1.5 rounded-xl text-[10px] font-black hover:bg-emerald-500 hover:text-white transition-all active:scale-95 flex items-center gap-2"
              >
                <CheckCircle2 size={12} /> PLATO COMPLETO (Auto)
              </button>
            </div>
            <div className="mb-8 grid grid-cols-2 lg:grid-cols-5 gap-3">{store.menuConfig.acompanamientos.map((a: string) => { const c = store.detalle.acompanamientos.includes(a); return (<button key={a} onClick={() => store.toggleAcompanamiento(a)} className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${c ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-neutral-800 border-transparent text-neutral-400 opacity-60 hover:opacity-100'}`}>{c ? `Con ${a}` : `Sin ${a}`}</button>); })}</div>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-3">3. Tipo de Sopa</h3>
              <div className="flex p-1 bg-neutral-900 border border-neutral-800 rounded-2xl mb-4 max-w-sm">
                <button 
                  onClick={() => store.detalle.mediaSopa && store.toggleMediaSopa()}
                  className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all ${!store.detalle.mediaSopa ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  SOPA ENTERA 🍲
                </button>
                <button 
                  onClick={() => !store.detalle.mediaSopa && store.toggleMediaSopa()}
                  className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all ${store.detalle.mediaSopa ? 'bg-amber-500 text-white shadow-lg shadow-amber-900/40' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  MEDIA SOPA 🥣
                </button>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button 
                  onClick={() => store.setSopa(null)} 
                  className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${!store.detalle.sopa ? 'bg-neutral-100 border-neutral-100 text-neutral-900' : 'bg-neutral-800 border-transparent text-neutral-300'}`}
                >
                  Sin sopa
                </button>
                {store.menuConfig.sopas.map((s: string) => (
                  <button 
                    key={s} 
                    onClick={() => store.setSopa(s)} 
                    className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${store.detalle.sopa === s ? 'bg-blue-500 border-blue-500 text-white' : 'bg-neutral-800 border-transparent text-neutral-300 hover:bg-neutral-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div><h3 className="text-sm font-semibold text-neutral-400 mb-3 uppercase tracking-wider">4. Adicionales</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{store.menuConfig.extras.map((e: { nombre: string; precio: number }) => { const c = store.detalle.extras.includes(e.nombre); return (<button key={e.nombre} onClick={() => store.toggleExtra(e.nombre, e.precio)} className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl transition-all active:scale-95 border-2 ${c ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-neutral-800 border-transparent text-neutral-400'}`}><span className="font-semibold">{e.nombre}</span><span className="text-xs opacity-70">+${e.precio}</span></button>); })}</div></div>
          </div>
        )}

        {/* TAB: Especiales de Arroz */}
        {activeTab === 'Especiales' && (
          <div className="py-2">
            <div className="mb-6 flex items-center gap-3"><div className="p-2 bg-yellow-500/20 rounded-xl"><span className="text-2xl">🍚</span></div><div><h3 className="text-lg font-black text-yellow-400">Especiales de Arroz</h3><p className="text-xs text-neutral-500">Puedes combinar varios en un mismo pedido usando "+ Agregar".</p></div></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {(store.menuConfig.arrozEspeciales || []).map(arroz => {
                const porcion = arrozPorcion[arroz.nombre] || 'pequeña';
                const cant = arrozCantidad[arroz.nombre] || 1;
                const precio = porcion === 'pequeña' ? arroz.precioSmall : arroz.precioLarge;
                const total = precio * cant;
                const selected = isArrozSelected(arroz);
                return (
                  <div key={arroz.nombre} className={`rounded-3xl p-5 border-2 flex flex-col gap-4 transition-all shadow-xl ${selected ? 'bg-yellow-500/10 border-yellow-500/60' : 'bg-neutral-800 border-neutral-700'}`}>
                    <p className={`font-black text-xl ${selected ? 'text-yellow-300' : 'text-white'}`}>{arroz.nombre}</p>
                    <div><p className="text-[10px] uppercase font-bold text-neutral-500 mb-2 tracking-widest">Tamaño</p><div className="grid grid-cols-2 gap-2"><button onClick={() => setArrozPorcion(p => ({ ...p, [arroz.nombre]: 'pequeña' }))} className={`py-3 rounded-xl font-bold text-sm transition-all border-2 ${porcion === 'pequeña' ? 'bg-yellow-500 border-yellow-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400'}`}><span className="block">Pequeña</span><span className="text-xs font-normal">${arroz.precioSmall.toLocaleString()}</span></button><button onClick={() => setArrozPorcion(p => ({ ...p, [arroz.nombre]: 'grande' }))} className={`py-3 rounded-xl font-bold text-sm transition-all border-2 ${porcion === 'grande' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400'}`}><span className="block">Grande</span><span className="text-xs font-normal">${arroz.precioLarge.toLocaleString()}</span></button></div></div>
                    <div><p className="text-[10px] uppercase font-bold text-neutral-500 mb-2 tracking-widest">Porciones</p><div className="flex items-center gap-3 bg-neutral-900 rounded-xl p-1.5 w-fit"><button onClick={() => updArrozCant(arroz.nombre, -1)} className="w-9 h-9 rounded-lg bg-neutral-800 text-white font-bold hover:bg-neutral-700">−</button><span className="font-black text-lg text-white w-5 text-center">{cant}</span><button onClick={() => updArrozCant(arroz.nombre, 1)} className="w-9 h-9 rounded-lg bg-neutral-800 text-white font-bold hover:bg-neutral-700">+</button></div></div>
                    <button onClick={() => seleccionarArroz(arroz)} className={`w-full py-3 rounded-2xl font-bold transition-all active:scale-95 text-sm ${selected ? 'bg-yellow-500 text-white' : 'bg-neutral-900 text-yellow-400 border border-yellow-900/50 hover:bg-neutral-700'}`}>{selected ? '✓ Seleccionado' : 'Seleccionar'} — ${total.toLocaleString()}</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: Snacks */}
        {activeTab === 'Snacks' && (
          <div className="py-6">
            <h3 className="text-sm font-semibold text-neutral-400 mb-6 uppercase tracking-wider">Snacks y Postres</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {store.menuConfig.snacks?.map(snack => {
                const qty = snackQtys[snack.nombre] || 1;
                const nameQ = qty > 1 ? `${qty}x ${snack.nombre}` : snack.nombre;
                const total = snack.precio * qty;
                const sel = store.detalle.proteina === nameQ && store.detalle.tipoPlato === 'snack';
                return (<div key={snack.nombre} className={`p-4 rounded-3xl border-2 text-center shadow-xl flex flex-col items-center ${sel ? 'bg-cyan-500/20 border-cyan-400' : 'bg-neutral-800 border-neutral-700'}`}><p className={`font-black text-xl mb-1 ${sel ? 'text-cyan-400' : 'text-white'}`}>{snack.nombre}</p><p className="text-sm mb-3 text-neutral-400">{snack.desc || `$${snack.precio.toLocaleString()} c/u`}</p><div className="flex items-center gap-4 bg-neutral-900 rounded-xl p-1 mb-4"><button onClick={() => updSnackQty(snack.nombre, -1)} className="w-8 h-8 rounded-lg bg-neutral-800 text-white font-bold hover:bg-neutral-700">-</button><span className="font-bold text-lg w-4 text-white text-center">{qty}</span><button onClick={() => updSnackQty(snack.nombre, 1)} className="w-8 h-8 rounded-lg bg-neutral-800 text-white font-bold hover:bg-neutral-700">+</button></div><button onClick={() => store.setSnackDirecto(nameQ, total)} className={`w-full py-3 rounded-xl font-bold transition-colors ${sel ? 'bg-cyan-500 text-white' : 'bg-neutral-900 text-cyan-400 border border-cyan-900/50 hover:bg-neutral-800'}`}>{sel ? 'Seleccionado' : 'Vender'} (${total.toLocaleString()})</button></div>);
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Panel Derecho: Cliente + Carrito ── */}
      <div className="w-full lg:w-96 flex flex-col gap-4">

        {/* Cliente */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><User size={20} className="text-neutral-400"/> Cliente</h3>
          <div className="mb-4">
            <div className="relative"><Search className="absolute left-3 top-3 text-neutral-500" size={18} /><input type="text" placeholder="Buscar (acepta seño, profesor, tildes...)" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-orange-500 transition-colors" value={search} onChange={e => setSearch(e.target.value)} onFocus={() => store.setResponsable(null)} /></div>
            {search && !store.responsable && (
              <div className="mt-2 bg-neutral-950 border border-neutral-800 rounded-xl max-h-44 overflow-y-auto">
                {clientes.filter(c => clienteMatches(c.nombre, search)).map(c => (<button key={c.id} onClick={() => { store.setResponsable(c); setSearch(c.nombre); }} className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0">{c.nombre}</button>))}
                <button onClick={() => setShowClienteForm(true)} className="w-full text-left px-4 py-3 text-orange-400 flex items-center gap-2 hover:bg-neutral-800 text-sm"><Plus size={16}/> Agregar nuevo</button>
              </div>
            )}
          </div>
          {showClienteForm && (<div className="flex gap-2 mb-4"><input type="text" placeholder="Nombre" className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 outline-none focus:border-orange-500" value={nuevoCliente} onChange={e => setNuevoCliente(e.target.value)} /><button onClick={crearCliente} disabled={loadingConfig} className="bg-neutral-800 p-3 rounded-xl hover:bg-neutral-700"><Save size={18} /></button></div>)}
          <div><label className="text-xs text-neutral-500 mb-1 block">Beneficiario (Quién recibe)</label><input type="text" placeholder="Ej: Carlos, Para llevar..." className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500" value={store.beneficiario} onChange={e => store.setBeneficiario(e.target.value)} /></div>
        </div>

        {/* Carrito */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex flex-col flex-1">
          <h3 className="text-lg font-bold mb-4 border-b border-neutral-800 pb-2 flex items-center gap-2">
            <ShoppingCart size={18} className="text-neutral-400" /> Pedido
            {numItems > 0 && <span className="ml-auto text-xs bg-orange-500/20 text-orange-400 font-black px-2 py-1 rounded-full">{numItems} ítem(s)</span>}
          </h3>

          {/* Items confirmados */}
          {store.carrito.length > 0 && (
            <div className="space-y-2 mb-3">
              {store.carrito.map((item, i) => (
                <div key={i} className="flex items-start gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{labelItem(item)}</p>{item.nota && <p className="text-xs text-yellow-400/70 italic">⚠️ {item.nota}</p>}</div>
                  <span className="text-xs font-black text-orange-400 shrink-0">${item.valor.toLocaleString()}</span>
                  <button onClick={() => store.removeItemDelCarrito(i)} className="text-neutral-600 hover:text-red-500 transition-colors shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Item en construcción */}
          {hayItemActual && (
            <div className="bg-orange-950/20 border border-orange-900/30 rounded-xl px-3 py-2 mb-3">
              <p className="text-[10px] uppercase font-bold text-orange-500/60 mb-1">Armando ahora...</p>
              <div className="text-sm text-neutral-300 space-y-1">
                <div className="flex justify-between"><span className="text-neutral-500">{store.detalle.tipoPlato === 'arroz' ? '🍚' : store.detalle.tipoPlato === 'snack' ? '🍦' : '🍗'}:</span><span className={`font-bold truncate ml-2 ${store.detalle.tipoPlato === 'arroz' ? 'text-yellow-300' : store.detalle.tipoPlato === 'snack' ? 'text-cyan-300' : 'text-white'}`}>{store.detalle.proteina}</span></div>
                {store.detalle.sopa && <div className="flex justify-between"><span className="text-neutral-500">Sopa:</span><span className="text-orange-300">{store.detalle.sopa}</span></div>}
                {store.detalle.acompanamientos.length > 0 && <div className="flex justify-between"><span className="text-neutral-500">Acompañ.:</span><span className="text-xs">{store.detalle.acompanamientos.join(', ')}</span></div>}
              </div>
              <div className="mt-2 border-t border-neutral-800 pt-2 flex justify-between items-center">
                <input type="text" placeholder="Nota (opcional)..." className="flex-1 mr-2 bg-neutral-950 border border-neutral-800 rounded-lg p-1.5 text-xs outline-none text-neutral-300" value={store.detalle.nota || ''} onChange={e => useOrderStore.setState({ detalle: { ...store.detalle, nota: e.target.value } })} />
                <div className="flex items-center gap-1 shrink-0"><span className="text-white font-bold text-sm">$</span><input type="number" className="w-16 bg-transparent text-right font-black text-white outline-none border-b border-neutral-700 focus:border-orange-500 text-sm" value={store.valorBase || ''} onChange={e => store.setValorBase(Number(e.target.value))} /></div>
              </div>
            </div>
          )}

          {/* Botón agregar al carrito */}
          {hayItemActual && (
            <button onClick={() => store.addItemAlCarrito()} className="w-full py-2.5 mb-3 rounded-xl font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-orange-400 border border-orange-900/30 hover:border-orange-500/50 transition-all flex items-center justify-center gap-2">
              <Plus size={16} /> Agregar al pedido (seguir agregando)
            </button>
          )}

          {/* Total y enviar */}
          <div className="mt-auto pt-3 border-t border-neutral-800">
            <div className="flex justify-between items-center mb-4"><span className="text-neutral-400 text-xs font-bold uppercase">Total</span><span className="text-2xl font-black text-white">${totalPedido.toLocaleString()}</span></div>
            <button onClick={handleSubmit} disabled={saving || numItems === 0}
              className={`w-full py-4 rounded-2xl text-lg font-bold text-white transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2 ${store.editingPedidoId ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-orange-500 to-red-600 shadow-orange-500/20'}`}>
              {saving ? 'Guardando...' : store.editingPedidoId ? 'Actualizar Pedido' : numItems > 1 ? `Enviar ${numItems} comidas a Cocina` : 'Enviar a Cocina'}
            </button>
          </div>
        </div>

        {/* Recientes */}
        {pedidosRecientes.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
            <h3 className="text-sm font-bold mb-3 border-b border-neutral-800 pb-2 text-neutral-400">📝 Recientes en Cocina</h3>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {pedidosRecientes.map(p => (<div key={p.id} onClick={() => cargarParaEdicion(p)} className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl cursor-pointer hover:border-orange-500/50 hover:bg-neutral-800 transition-colors"><div className="flex justify-between items-start mb-1"><span className="font-bold text-white text-sm truncate max-w-[150px]">{p.beneficiario}</span><span className="text-xs text-orange-400 font-bold">${p.valor?.toLocaleString()}</span></div><p className="text-xs text-neutral-500 truncate">{p.detalle?.items ? `${p.detalle.items.length} ítems` : p.detalle?.proteina}</p></div>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useOrderStore, MENU_CONFIG_ID, type Cliente } from '../store/orderStore';
import { User, Search, Plus, Save, Settings2, Pencil } from 'lucide-react';

export default function Ventas() {
  const store = useOrderStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'Restaurante' | 'Snacks'>('Restaurante');
  const [pedidosRecientes, setPedidosRecientes] = useState<any[]>([]);
  const [editingPedidoId, setEditingPedidoId] = useState<string | null>(null);

  // Estados locales para la edición del menú
  const [newProteina, setNewProteina] = useState('');
  const [newAcomp, setNewAcomp] = useState('');
  const [newSopa, setNewSopa] = useState('');
  const [newExtra, setNewExtra] = useState('');
  const [newExtraPrecio, setNewExtraPrecio] = useState('');

  useEffect(() => {
    fetchClientes();
    fetchPedidosRecientes();
  }, []);

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    if (data) {
       const f = (data as Cliente[]).filter(c => c.id !== MENU_CONFIG_ID);
       setClientes(f);
    }
  };

  const fetchPedidosRecientes = async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const { data } = await supabase.from('pedidos')
      .select('*, clientes(nombre)')
      .gte('created_at', startOfDay.toISOString())
      .neq('estado_cocina', 'empacado')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setPedidosRecientes(data);
  };

  const crearCliente = async () => {
    if (!nuevoCliente) return;
    setLoadingConfig(true);
    const { data } = await supabase.from('clientes').insert([{ nombre: nuevoCliente, es_frecuente: true }]).select().single();
    if (data) {
      setClientes([...clientes, data as Cliente]);
      store.setResponsable(data as Cliente);
      setShowClienteForm(false);
      setNuevoCliente('');
    }
    setLoadingConfig(false);
  };

  const handleSubmit = async () => {
    if (!store.detalle.proteina) {
      alert("Por favor selecciona una proteína.");
      return;
    }
    
    if (!store.responsable && !store.beneficiario.trim()) {
      alert("Por favor selecciona un cliente frecuente o ingresa el nombre del beneficiario.");
      return;
    }
    
    setSaving(true);

    // Determinar si es un snack o un menú. 
    // Un snack base es un "extra" que se vende de manera individual, por lo que su nombre de proteína coincide con un extra, sin acompañamientos ni sopa, 
    // y para este caso: activeTab puede que sea Snacks, por lo que el estado de cocina pasaría directamente a empacado.
    const esSnackDirecto = store.menuConfig.extras.some(e => store.detalle.proteina?.includes(e.nombre)) && store.detalle.acompanamientos.length === 0 && !store.detalle.sopa;

    const orderData = {
      responsable_id: store.responsable?.id || null,
      beneficiario: store.beneficiario.trim(),
      detalle: store.detalle,
      valor: store.valorBase,
      estado_cocina: esSnackDirecto ? 'empacado' : 'pendiente',
      estado_entrega: 'en_espera',
      pagado: false
    };

    if (editingPedidoId) {
       const { error } = await supabase.from('pedidos').update({
         responsable_id: orderData.responsable_id,
         beneficiario: orderData.beneficiario,
         detalle: orderData.detalle,
         valor: orderData.valor
       }).eq('id', editingPedidoId);
       
       setSaving(false);
       if (error) {
         alert("Error al actualizar pedido: " + error.message);
       } else {
         store.resetOrder();
         setEditingPedidoId(null);
         fetchPedidosRecientes();
         alert("¡Pedido actualizado en cocina!");
       }
       return;
    }

    const { error } = await supabase.from('pedidos').insert([orderData]);
    setSaving(false);
    
    if (error) {
      alert("Error al guardar pedido: " + error.message);
    } else {
      store.resetOrder();
      fetchPedidosRecientes();
      alert("¡Pedido enviado a cocina!");
    }
  };

  const cargarParaEdicion = (p: any) => {
     setEditingPedidoId(p.id);
     useOrderStore.setState({
       responsable: p.responsable_id ? clientes.find(c => c.id === p.responsable_id) || null : null,
       beneficiario: p.beneficiario || '',
       detalle: p.detalle,
       valorBase: p.valor,
       precioManual: true
     });
     window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-2 md:p-6 text-neutral-100">
      
      {/* Columna Izquierda: Constructor de Plato */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-3xl p-4 md:p-6 shadow-xl relative">
        <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4">
          <div className="flex bg-neutral-950 p-1 rounded-2xl">
            <button 
              onClick={() => setActiveTab('Restaurante')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'Restaurante' ? 'bg-orange-500 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              Restaurante
            </button>
            <button 
              onClick={() => setActiveTab('Snacks')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'Snacks' ? 'bg-cyan-500 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              Bolis y Helados
            </button>
          </div>
          <div className="flex gap-2">
            {editingPedidoId && (
              <button onClick={() => { setEditingPedidoId(null); store.resetOrder(); }} className="px-4 py-2 bg-red-500/20 text-red-500 font-bold rounded-xl text-sm hover:bg-red-500/40 transition-colors">
                 Cancelar Edición
              </button>
            )}
            <button onClick={() => setShowConfig(!showConfig)} className="p-3 bg-neutral-800 text-neutral-400 rounded-xl hover:text-white transition-colors" title="Editar Menú del Día">
               <Settings2 size={24} />
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="mb-8 p-4 bg-black/40 border border-neutral-800 rounded-2xl">
            <h3 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2"><Pencil size={18}/> Editar Menú Local</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div>
                  <h4 className="text-sm text-neutral-500 mb-2">Proteínas</h4>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {store.menuConfig.proteinas.map(p => (
                       <span key={p} className="text-xs bg-neutral-800 px-2 py-1 rounded flex items-center gap-1">
                          {p} <button className="text-red-400 font-bold ml-1 hover:text-red-300" onClick={() => store.setMenuConfig({ proteinas: store.menuConfig.proteinas.filter(x => x !== p) })}>x</button>
                       </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input type="text" value={newProteina} onChange={e => setNewProteina(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-sm outline-none text-white" placeholder="Nueva..." />
                    <button onClick={() => { if(newProteina) { store.setMenuConfig({ proteinas: [...store.menuConfig.proteinas, newProteina] }); setNewProteina(''); } }} className="bg-neutral-800 px-2 rounded font-bold hover:bg-neutral-700">+</button>
                  </div>
               </div>
               <div>
                  <h4 className="text-sm text-neutral-500 mb-2">Acompañamientos</h4>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {store.menuConfig.acompanamientos.map(a => (
                       <span key={a} className="text-xs bg-neutral-800 px-2 py-1 rounded flex items-center gap-1">
                          {a} <button className="text-red-400 font-bold ml-1 hover:text-red-300" onClick={() => store.setMenuConfig({ acompanamientos: store.menuConfig.acompanamientos.filter(x => x !== a) })}>x</button>
                       </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input type="text" value={newAcomp} onChange={e => setNewAcomp(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-sm outline-none text-white" placeholder="Nuevo..." />
                    <button onClick={() => { if(newAcomp) { store.setMenuConfig({ acompanamientos: [...store.menuConfig.acompanamientos, newAcomp] }); setNewAcomp(''); } }} className="bg-neutral-800 px-2 rounded font-bold hover:bg-neutral-700">+</button>
                  </div>
               </div>
               <div>
                  <h4 className="text-sm text-neutral-500 mb-2">Sopas</h4>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {store.menuConfig.sopas.map(s => (
                       <span key={s} className="text-xs bg-neutral-800 px-2 py-1 rounded flex items-center gap-1">
                          {s} <button className="text-red-400 font-bold ml-1 hover:text-red-300" onClick={() => store.setMenuConfig({ sopas: store.menuConfig.sopas.filter(x => x !== s) })}>x</button>
                       </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input type="text" value={newSopa} onChange={e => setNewSopa(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-sm outline-none text-white" placeholder="Nueva..." />
                    <button onClick={() => { if(newSopa) { store.setMenuConfig({ sopas: [...store.menuConfig.sopas, newSopa] }); setNewSopa(''); } }} className="bg-neutral-800 px-2 rounded font-bold hover:bg-neutral-700">+</button>
                  </div>
               </div>
               <div>
                  <h4 className="text-sm text-neutral-500 mb-2">Adicionales (Extras)</h4>
                  <div className="flex flex-col gap-2 mb-2">
                    {store.menuConfig.extras.map(e => (
                       <span key={e.nombre} className="text-xs bg-neutral-800 px-2 py-1 rounded flex items-center justify-between">
                          <span>{e.nombre} (${e.precio})</span>
                          <button className="text-red-400 font-bold ml-1 hover:text-red-300" onClick={() => store.setMenuConfig({ extras: store.menuConfig.extras.filter(x => x.nombre !== e.nombre) })}>x</button>
                       </span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <input type="text" value={newExtra} onChange={e => setNewExtra(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-sm outline-none text-white" placeholder="Extra..." />
                    <div className="flex gap-1">
                      <input type="number" value={newExtraPrecio} onChange={e => setNewExtraPrecio(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-sm outline-none text-white" placeholder="Valor ($)..." />
                      <button onClick={() => { if(newExtra && newExtraPrecio) { store.setMenuConfig({ extras: [...store.menuConfig.extras, { nombre: newExtra, precio: Number(newExtraPrecio) }] }); setNewExtra(''); setNewExtraPrecio(''); } }} className="bg-neutral-800 px-2 rounded font-bold hover:bg-neutral-700">+</button>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL DEPENDIENDO DEL TAB */}
        {activeTab === 'Restaurante' ? (
          <div>
            {/* PROTEÍNA */}
            <div className="mb-8">
          <h3 className="text-lg font-semibold text-neutral-400 mb-3 uppercase tracking-wider text-sm">1. Proteína Principal</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {store.menuConfig.proteinas.map((p: string) => (
              <button key={p} 
                onClick={() => store.setProteina(p)}
                className={`py-4 px-2 rounded-2xl text-lg font-medium transition-all active:scale-95 border-2 ${store.detalle.proteina === p ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-neutral-800 border-transparent text-neutral-300 hover:bg-neutral-700'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* ACOMPAÑAMIENTOS */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
             <h3 className="text-lg font-semibold text-neutral-400 uppercase tracking-wider text-sm">2. Acompañamientos</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {store.menuConfig.acompanamientos.map((a: string) => {
              const checked = store.detalle.acompanamientos.includes(a);
              return (
                <button key={a} onClick={() => store.toggleAcompanamiento(a)}
                  className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${checked ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-neutral-800 border-transparent text-neutral-400 opacity-60 hover:opacity-100'}`}>
                  {checked ? `Con ${a}` : `Sin ${a}`}
                </button>
              )
            })}
          </div>
        </div>

        {/* SOPA */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-neutral-400 mb-3 uppercase tracking-wider text-sm">3. Selección de Sopa</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
               onClick={() => store.setSopa(null)}
               className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${!store.detalle.sopa ? 'bg-blue-500 border-blue-500 text-white' : 'bg-neutral-800 border-transparent text-neutral-300'}`}>
               Sin sopa
            </button>
            {store.menuConfig.sopas.map((s: string) => (
              <button key={s} 
                onClick={() => store.setSopa(s)}
                className={`py-3 px-2 rounded-2xl text-md font-medium transition-all active:scale-95 border-2 ${store.detalle.sopa === s ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-neutral-800 border-transparent text-neutral-300 hover:bg-neutral-700'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

            {/* EXTRAS */}
            <div className="mb-0">
              <h3 className="text-lg font-semibold text-neutral-400 mb-3 uppercase tracking-wider text-sm flex items-center gap-2">4. Adicionales <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">+</span></h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {store.menuConfig.extras.map((e: {nombre: string, precio: number}) => {
                  const checked = store.detalle.extras.includes(e.nombre);
                  return (
                    <button key={e.nombre}
                      onClick={() => store.toggleExtra(e.nombre, e.precio)}
                      className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl transition-all active:scale-95 border-2 ${checked ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-neutral-800 border-transparent text-neutral-400'}`}>
                      <span className="font-semibold">{e.nombre}</span>
                      <span className="text-xs opacity-70">+${e.precio}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6">
             <h3 className="text-lg font-semibold text-neutral-400 mb-6 uppercase tracking-wider text-sm">Snacks, Postres y Bebidas Individuales</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {store.menuConfig.extras.map(snack => {
                   const isSelected = store.detalle.proteina === snack.nombre && store.detalle.acompanamientos.length === 0 && !store.detalle.sopa;
                   return (
                     <div key={snack.nombre} className={`p-4 rounded-3xl transition-all border-2 text-center shadow-xl flex flex-col items-center ${isSelected ? 'bg-cyan-500/20 border-cyan-400 shadow-cyan-500/10' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'}`}>
                       <p className={`font-black text-xl mb-1 ${isSelected ? 'text-cyan-400' : 'text-cyan-400'}`}>{snack.nombre}</p>
                       <p className="text-2xl font-black text-white my-3">${snack.precio.toLocaleString()}</p>
                       
                       <button 
                         onClick={() => store.setSnackDirecto(snack.nombre, snack.precio)}
                         className={`w-full py-3 rounded-xl font-bold transition-colors ${isSelected ? 'bg-cyan-500 text-white' : 'bg-neutral-900 text-cyan-400 border border-cyan-900/50 hover:bg-neutral-800'}`}
                       >
                         {isSelected ? 'Seleccionado' : 'Vender Directamente'}
                       </button>
                     </div>
                   );
                })}
             </div>
             
             <div className="mt-8 bg-blue-950/20 border border-blue-900/50 p-4 rounded-xl">
                <p className="text-sm text-blue-400 font-medium">
                  💡 <b>Tip:</b> Si el cliente pide un almuerzo Y un boli, lo más fácil es seleccionarlo como 'Adicional' en la pestaña <b>Restaurante</b>. Si piden SOLO un boli o helado suelto, usa esta pestaña para enviarlo directamente a <b>Despacho</b> sin pasar por la cola de Cocina.
                </p>
             </div>
          </div>
        )}

      </div>

      {/* Columna Derecha: Cliente y Checkout */}
      <div className="w-full lg:w-96 flex flex-col gap-6">
        
        {/* Asignación de Cliente */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
           <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
             <User size={20} className="text-neutral-400"/> Datos del Cliente
           </h3>
           
           <div className="mb-4">
             <div className="relative">
               <Search className="absolute left-3 top-3 text-neutral-500" size={18} />
               <input 
                 type="text" 
                 placeholder="Buscar cliente frecuente..."
                 className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-orange-500 transition-colors"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 onFocus={() => store.setResponsable(null)}
               />
             </div>
             {search && !store.responsable && (
               <div className="mt-2 bg-neutral-950 border border-neutral-800 rounded-xl max-h-40 overflow-y-auto">
                 {clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase())).map(c => (
                   <button key={c.id} onClick={() => { store.setResponsable(c); setSearch(c.nombre); }} className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0">
                     {c.nombre}
                   </button>
                 ))}
                 <button onClick={() => setShowClienteForm(true)} className="w-full text-left px-4 py-3 text-orange-400 flex items-center gap-2 hover:bg-neutral-800">
                   <Plus size={16}/> Agregar nuevo
                 </button>
               </div>
             )}
           </div>

           {showClienteForm && (
             <div className="flex gap-2 mb-4">
               <input 
                 type="text" 
                 placeholder="Nombre del cliente"
                 className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 outline-none focus:border-orange-500"
                 value={nuevoCliente}
                 onChange={e => setNuevoCliente(e.target.value)}
               />
               <button onClick={crearCliente} disabled={loadingConfig} className="bg-neutral-800 p-3 rounded-xl hover:bg-neutral-700">
                 <Save size={18} />
               </button>
             </div>
           )}

           <div className="mb-2">
             <label className="text-xs text-neutral-500 mb-1 block">Beneficiario (Quién recibe)</label>
             <input 
                 type="text" 
                 placeholder="Ej: Para llevar"
                 className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors"
                 value={store.beneficiario}
                 onChange={e => store.setBeneficiario(e.target.value)}
               />
           </div>
        </div>

        {/* Resumen */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex-1 flex flex-col">
          <h3 className="text-lg font-bold mb-4 border-b border-neutral-800 pb-2">Resumen</h3>
          
          <div className="flex-1 space-y-3 text-sm text-neutral-300 overflow-y-auto">
            <div className="flex justify-between items-center">
              <span>Proteína:</span>
              <span className="font-semibold text-white">{store.detalle.proteina || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Acompañ.:</span>
              <span className="text-right">{store.detalle.acompanamientos.join(', ')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Sopa:</span>
              <span>{store.detalle.sopa || 'Ninguna'}</span>
            </div>
            {store.detalle.extras.length > 0 && (
              <div className="flex justify-between items-center text-purple-400">
                <span>Extras:</span>
                <span className="text-right">{store.detalle.extras.join(', ')}</span>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-neutral-800 pt-4">
             <label className="text-xs font-bold text-neutral-500 w-full flex items-center gap-2">
                Notas / Modificaciones
             </label>
             <input type="text" placeholder="Ej: Sin cebolla, extra arroz..." 
                className="w-full mt-2 bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-sm outline-none focus:border-neutral-600 text-neutral-300"
                value={store.detalle.nota || ''}
                onChange={e => { useOrderStore.setState({ detalle: { ...store.detalle, nota: e.target.value }}) }}
             />
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-between items-end gap-2">
            <div className="flex flex-col">
               <span className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-1">Total a cobrar</span>
               <span className="text-xs text-orange-400 font-bold">{store.precioManual ? '(Editado Manualmente)' : '(Auto)'}</span>
            </div>
            <div className="flex items-center">
               <span className="text-3xl font-black text-white mr-1">$</span>
               <input 
                 type="number"
                 className="w-24 bg-transparent text-3xl font-black text-right outline-none text-white border-b-2 border-transparent focus:border-orange-500"
                 value={store.valorBase || ''}
                 onChange={e => store.setValorBase(Number(e.target.value))}
               />
            </div>
          </div>

          <button 
            onClick={handleSubmit}  
            disabled={saving || !store.detalle.proteina}
            className={`w-full mt-6 py-4 rounded-2xl text-lg font-bold text-white transition-all active:scale-95 shadow-xl disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2 ${editingPedidoId ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-500/20' : 'bg-gradient-to-r from-orange-500 to-red-600 shadow-orange-500/20'}`}>
            {saving ? 'Guardando...' : (editingPedidoId ? 'Actualizar Pedido' : 'Enviar a Cocina')}
          </button>
        </div>

        {/* Últimos Pedidos (Edición Rápida) */}
        {pedidosRecientes.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex-1 flex flex-col mt-2">
             <h3 className="text-sm font-bold mb-3 border-b border-neutral-800 pb-2 text-neutral-400">📝 Pedidos Recientes (En Cocina)</h3>
             <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {pedidosRecientes.map(p => (
                   <div key={p.id} onClick={() => cargarParaEdicion(p)} className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl cursor-pointer hover:border-orange-500/50 hover:bg-neutral-800 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                         <span className="font-bold text-white text-sm truncate max-w-[150px]">{p.beneficiario}</span>
                         <span className="text-xs text-orange-400 font-bold">${p.valor}</span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate">{p.detalle.proteina} + {p.detalle.acompanamientos.join(', ')}</p>
                   </div>
                ))}
             </div>
          </div>
        )}

      </div>
    </div>
  );
}

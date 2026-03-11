import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Wallet, Search, TrendingDown, CalendarDays, Banknote, DollarSign, Share2, Trash2 } from 'lucide-react';
import { type Cliente, type Pedido, MENU_CONFIG_ID } from '../store/orderStore';

export default function Cuentas() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historialPedidos, setHistorialPedidos] = useState<Pedido[]>([]);
  const [pagosRealizados, setPagosRealizados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deudaGlobal, setDeudaGlobal] = useState(0);
  const [editingPrecioId, setEditingPrecioId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number | string>('');

  // Formulario Pago
  const [montoPago, setMontoPago] = useState<number | string>('');
  const [metodo, setMetodo] = useState<'Efectivo' | 'Transferencia'>('Efectivo');
  const [savingPayment, setSavingPayment] = useState(false);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);

  useEffect(() => {
    fetchClientes();
    fetchDeudaGlobal();
  }, []);

  const fetchDeudaGlobal = async () => {
    // En lugar de pelear con Postgrest por los nulos, traemos los montos y sus estados y filtramos en JS.
    // Esto es muy seguro porque solo traemos valores booleanos y números
    const { data: pedidosData, error: errP } = await supabase.from('pedidos').select('valor, pagado');
    const { data: pagosData, error: errPag } = await supabase.from('pagos').select('monto, metodo');
    
    if (pedidosData && pagosData) {
      // Filtrar los que estrictamente no están pagados formalmente (incluye null y false)
      const pedidosDeuda = pedidosData.filter(p => !p.pagado);
      const pagosGenerales = pagosData.filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'));

      const totalConsumo = pedidosDeuda.reduce((acc, curr) => acc + curr.valor, 0);
      const totalAbonos = pagosGenerales.reduce((acc, curr) => acc + curr.monto, 0);
      setDeudaGlobal(Math.max(0, totalConsumo - totalAbonos));
    } else {
      console.error("Error fetching global debt:", errP, errPag);
    }
  };

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    if (data) setClientes((data as Cliente[]).filter(c => c.id !== MENU_CONFIG_ID));
  };

  const seleccionarCliente = async (c: Cliente) => {
    setSelectedCliente(c);
    setSearch(c.nombre);
    setLoading(true);

    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('*')
      .eq('responsable_id', c.id)
      .order('created_at', { ascending: false });

    const { data: pagos } = await supabase
      .from('pagos')
      .select('*')
      .eq('cliente_id', c.id)
      .order('fecha', { ascending: false });

    if (pedidos) setHistorialPedidos(pedidos as Pedido[]);
    if (pagos) setPagosRealizados(pagos);
    setLoading(false);
  };

  const calcularDeudaTotal = () => {
    const pendienteSum = historialPedidos
      .filter(p => !p.pagado)
      .reduce((acc, p) => acc + p.valor, 0);

    const totalAbonosGenerales = pagosRealizados
      .filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'))
      .reduce((acc, p) => acc + p.monto, 0);

    return Math.max(0, pendienteSum - totalAbonosGenerales);
  };

  const getSubtotalConsumo = () => historialPedidos.filter(p => !p.pagado).reduce((acc, p) => acc + p.valor, 0);
  const getSubtotalAbonos = () => pagosRealizados.filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado')).reduce((acc, p) => acc + p.monto, 0);
  const pagarDeuda = async () => {
    const abono = typeof montoPago === 'string' ? parseFloat(montoPago) : montoPago;
    
    if (!abono || abono <= 0) return alert('Ingresa un monto válido.');
    if (!selectedCliente) return;

    setSavingPayment(true);

    // Registrar abono general. 
    // IMPORTANTE: En el balance puro, esto NO marca pedidos como pagados.
    const { data: insertResult, error: errorPago } = await supabase.from('pagos').insert([{
      cliente_id: selectedCliente.id,
      monto: abono,
      metodo: metodo
    }]).select();

    if (!errorPago) {
      if (abono >= calcularDeudaTotal()) {
         // SALDAR Y ARCHIVAR TODO AUTOMÁTICAMENTE
         // 1. Marcar todos los platos pendientes como pagados
         const pedidosPendientesIds = historialPedidos.filter(p => !p.pagado).map(p => p.id);
         if (pedidosPendientesIds.length > 0) {
            await supabase.from('pedidos').update({ pagado: true }).in('id', pedidosPendientesIds);
         }
         // 2. Archivar abonos anteriores (para que no resten a deudas futuras que arrancan de 0)
         const abonosActivosIds = pagosRealizados.filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado')).map(p => p.id);
         if (abonosActivosIds.length > 0) {
            // Un pequeño truco para evitar actualizar 1 por 1, en supabase JS es update con 'in' o hacer loop
            for (const pagoId of abonosActivosIds) {
               const pOriginal = pagosRealizados.find(x => x.id === pagoId);
               await supabase.from('pagos').update({ metodo: `Archivado: ${pOriginal.metodo}` }).eq('id', pagoId);
            }
         }
         // 3. Este mismo abono que estamos creando (si sobra plata o exacto) pasará a ser "Saldado" o simplemente se marca para no estorbar en el futuro.
         // Realmente es mejor actualizarlo a "Archivado" de una vez si cubrió todo, dejando la deuda en 0.
         const dataPagoNuevo = insertResult && insertResult[0];
         if (dataPagoNuevo) {
            await supabase.from('pagos').update({ metodo: `Archivado: ${metodo}` }).eq('id', dataPagoNuevo.id);
         }
         alert('Deuda completamente saldada. La cuenta se ha limpiado y archivado.');
      } else {
         alert('Abono registrado correctamente.');
      }

      setMontoPago('');
      
      setTimeout(() => {
        if (selectedCliente) seleccionarCliente(selectedCliente);
        fetchDeudaGlobal();
      }, 500); 
    } else {
      alert('Hubo un error registrando el pago.');
    }

    setSavingPayment(false);
  };

  const guardarNuevoPrecio = async (id: string) => {
    const valor = Number(nuevoPrecio);
    if (isNaN(valor) || valor < 0) return setEditingPrecioId(null);
    
    await supabase.from('pedidos').update({ valor }).eq('id', id);
    setEditingPrecioId(null);
    if (selectedCliente) seleccionarCliente(selectedCliente);
    fetchDeudaGlobal();
  };

  const saldarPedidoEspecifico = async (p: Pedido) => {
    if (!selectedCliente) return;
    setSavingPayment(true);
    const { error } = await supabase.from('pagos').insert([{
      cliente_id: selectedCliente.id,
      monto: p.valor,
      metodo: 'Saldado: Efectivo'
    }]);

    if (!error) {
      await supabase.from('pedidos').update({ pagado: true }).eq('id', p.id);
      seleccionarCliente(selectedCliente);
      fetchDeudaGlobal();
    }
    setSavingPayment(false);
  };

  const eliminarAbono = async (id: string, monto: number) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar este abono de $${monto.toLocaleString()}?`)) return;
    
    setLoading(true);
    const { error } = await supabase.from('pagos').delete().eq('id', id);
    
    if (!error) {
      if (selectedCliente) seleccionarCliente(selectedCliente);
      fetchDeudaGlobal();
    } else {
      alert('Error al intentar eliminar el abono.');
      setLoading(false);
    }
  };

  const generarReporteText = () => {
    if (!selectedCliente || historialPedidos.length === 0) return;
    
    // El total consumido menos lo pagado
    const deuda = calcularDeudaTotal();
    if (deuda <= 0) return alert('Este cliente no tiene deudas pendientes.');

    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesActual = meses[new Date().getMonth()];
    
    let texto = `${selectedCliente.nombre.trim()} ${mesActual}\n\n`;
    
    // Solo mostrar los pedidos que sumados superan el monto pagado (desde los más recientes hacia atrás)
    // O de forma más simple según el usuario: Solo mostrar los que no están marcados como pagados formalmente.
    // Pero como ahora es por abonos, mostraremos los pedidos pendientes de saldar.
    
    const pedidosPendientes = mostrarArchivados ? historialPedidos : historialPedidos.filter(p => !p.pagado);
    const abonosGenerales = mostrarArchivados ? pagosRealizados : pagosRealizados.filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'));

    pedidosPendientes.forEach(p => {
      const d = new Date(p.created_at || '');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      
      let detalleStr = p.detalle?.proteina || '';
      if (p.detalle?.sopa) detalleStr += ` con sopa de ${p.detalle.sopa}`;
      
      let extraStr = '';
      if (p.detalle?.extras && p.detalle.extras.length > 0) {
         extraStr = ' + ' + p.detalle.extras.join(' + ');
      }
      
      texto += `${day}/${month}/${year} ${detalleStr}${extraStr}\n`;
    });

    if (abonosGenerales.length > 0) {
      texto += `\n--- HISTORIAL DE ABONOS ---\n`;
      abonosGenerales.forEach(pago => {
        const dp = new Date(pago.fecha || new Date());
        texto += `${dp.toLocaleDateString()}: - $${pago.monto.toLocaleString()} (${pago.metodo})\n`;
      });
    }
    
    texto += `\n*TOTAL DEUDA: $${deuda.toLocaleString()}*`;
    
    navigator.clipboard.writeText(texto);
    alert('Reporte copiado al portapapeles.');
  };

  const deudaVisible = calcularDeudaTotal();

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-2 md:p-6 text-neutral-100">
      
      {/* Columna Izquierda: Buscador de Clientes */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        
        {/* Tarjeta de Resumen Global */}
        <div className="bg-gradient-to-br from-red-600 to-orange-500 border border-red-500 rounded-3xl p-5 shadow-xl shadow-red-500/20 text-white">
           <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">Deuda Global en la Calle</p>
           <h3 className="text-4xl font-black">${deudaGlobal.toLocaleString()}</h3>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl flex flex-col flex-1">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Wallet className="text-blue-500" /> Cuentas
          </h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 text-neutral-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar cliente para cobrar..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-blue-500 transition-colors"
              value={search}
              onChange={e => {
                 setSearch(e.target.value);
                 if (selectedCliente && e.target.value !== selectedCliente.nombre) {
                    setSelectedCliente(null);
                    setHistorialPedidos([]);
                 }
              }}
            />
          </div>

          {!selectedCliente && search && (
             <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-h-60 overflow-y-auto">
                {clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)} className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0">
                    <span className="font-bold">{c.nombre}</span>
                    {c.es_frecuente && <span className="ml-2 text-xs bg-orange-500/20 text-orange-400 px-2 rounded-lg">Frecuente</span>}
                  </button>
                ))}
             </div>
          )}

          {!selectedCliente && !search && (
            <div className="flex-1 py-12 flex flex-col items-center justify-center text-neutral-500">
               <TrendingDown size={40} className="mb-4 opacity-30"/>
               <p className="text-center">Busca un cliente para<br/>ver su estado de cuenta.</p>
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Estado de Cuenta */}
      <div className="flex-1">
        {selectedCliente ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 md:p-8 shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                   <h2 className="text-3xl font-black text-white decoration-blue-500 underline decoration-4 underline-offset-4 mb-2">{selectedCliente.nombre}</h2>
                   <p className="text-neutral-400 font-mono text-sm">ID: {selectedCliente.id.split('-')[0]}...</p>
                </div>
                 <div className="bg-neutral-950 p-4 border border-neutral-800 rounded-2xl flex flex-col gap-1 min-w-[200px] shadow-2xl">
                    <div className="flex justify-between items-center text-[10px] uppercase font-black text-neutral-500 tracking-widest">
                      <span>Consumido (Pendiente):</span>
                      <span className="text-white font-mono">${getSubtotalConsumo().toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase font-black text-emerald-500 tracking-widest">
                      <span>Abonos Realizados:</span>
                      <span className="font-mono">- ${getSubtotalAbonos().toLocaleString()}</span>
                    </div>
                    <div className="border-t border-neutral-800 mt-2 pt-2 flex justify-between items-center bg-red-950/20 px-2 rounded-lg py-1">
                       <p className="text-red-400 text-[10px] font-black uppercase tracking-tighter">Deuda Neta</p>
                       <p className="text-3xl font-black text-white font-mono">${deudaVisible.toLocaleString()}</p>
                    </div>
                 </div>
              </div>

             {/* Gestión de Pago Rápida */}
             {deudaVisible > 0 && !loading && (
               <div className="bg-blue-950/20 border border-blue-900/50 rounded-2xl p-4 md:p-6 mb-8 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 block">Monto a abonar</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" size={20}/>
                      <input 
                         type="number" 
                         className="w-full bg-neutral-950 border border-blue-900/50 rounded-xl py-4 pl-10 pr-4 outline-none focus:border-blue-400 text-white font-bold text-lg"
                         placeholder="0"
                         value={montoPago}
                         onChange={e => setMontoPago(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                     <div className="flex gap-2">
                        <button 
                           onClick={() => setMetodo('Efectivo')}
                           className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold border-2 transition-colors ${metodo === 'Efectivo' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-neutral-950 border-neutral-800 text-neutral-500'}`}>
                           💵 Efectivo
                        </button>
                        <button 
                           onClick={() => setMetodo('Transferencia')}
                           className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold border-2 transition-colors ${metodo === 'Transferencia' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-neutral-950 border-neutral-800 text-neutral-500'}`}>
                           🏦 Transf.
                        </button>
                     </div>
                     <button 
                       onClick={pagarDeuda}
                       disabled={savingPayment || !montoPago || Number(montoPago) <= 0}
                       className="w-full py-4 rounded-xl text-white font-black bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                       {savingPayment ? 'Procesando...' : (Number(montoPago) >= deudaVisible ? 'Saldar Todo' : 'Registrar Abono')}
                     </button>
                  </div>
               </div>
             )}

             <div className="flex justify-between items-center mb-4 mt-8 pb-2 border-b border-neutral-800">
               <div>
                 <h3 className="text-lg font-bold text-neutral-400">Historial y Detalles de Consumo</h3>
                 <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-neutral-500 hover:text-white transition-colors">
                    <input type="checkbox" checked={mostrarArchivados} onChange={e => setMostrarArchivados(e.target.checked)} className="rounded border-neutral-700 bg-neutral-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900" />
                    Mostrar historial archivado (pagados)
                 </label>
               </div>
               {deudaVisible > 0 && (
                 <button onClick={generarReporteText} className="flex items-center gap-2 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                   <Share2 size={14}/> Copiar Reporte WhatsApp
                 </button>
               )}
             </div>
             
             {loading ? (
                <div className="py-12 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div></div>
             ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20 md:pb-0">
                {/* Lista de Pedidos (Debe / Consumo) */}
                <div className="space-y-3">
                   <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Consumo Individual</h4>
                   {historialPedidos.filter(p => mostrarArchivados ? true : !p.pagado).map(p => {
                     const d = new Date(p.created_at || '');
                     return (
                       <div key={p.id} className="flex justify-between items-center bg-neutral-950 border border-neutral-800 p-4 rounded-2xl relative overflow-hidden">
                         {!p.pagado && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
                         {p.pagado && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>}
                                                  <div className="pl-3">
                            <p className="font-bold text-white mb-1">
                              {p.detalle?.proteina} 
                              {p.detalle?.sopa && <span className="text-orange-400 ml-1">+ Sopa de {p.detalle.sopa}</span>}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {p.detalle?.acompanamientos?.join(', ')}
                            </p>
                            <p className="text-[10px] text-neutral-500 flex items-center gap-1 mt-1">
                              <CalendarDays size={10}/> {d.toLocaleDateString()}
                            </p>
                          </div>
                         <div className="text-right flex flex-col items-end gap-1">
                           {editingPrecioId === p.id ? (
                             <div className="flex gap-1">
                               <input 
                                 type="number" 
                                 className="w-20 bg-neutral-800 text-white rounded px-1 text-sm font-bold border border-blue-500"
                                 value={nuevoPrecio}
                                 onChange={e => setNuevoPrecio(e.target.value)}
                                 autoFocus
                                 onBlur={() => guardarNuevoPrecio(p.id!)}
                                 onKeyDown={e => e.key === 'Enter' && guardarNuevoPrecio(p.id!)}
                               />
                             </div>
                           ) : (
                             <p 
                               className={`font-black text-lg cursor-pointer hover:text-blue-400 ${p.pagado ? 'text-emerald-400 line-through opacity-50' : 'text-orange-400'}`}
                               onClick={() => { setEditingPrecioId(p.id!); setNuevoPrecio(p.valor); }}
                             >
                               ${p.valor.toLocaleString()}
                             </p>
                           )}
                           {!p.pagado && (
                             <button 
                               onClick={() => saldarPedidoEspecifico(p)}
                               className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-600 hover:text-white transition-colors"
                             >
                               Saldar Día
                             </button>
                           )}
                         </div>
                       </div>
                     )
                   })}
                   {historialPedidos.length === 0 && (
                      <div className="text-center py-12 text-neutral-500 border-2 border-dashed border-neutral-800 rounded-2xl">
                         No hay pedidos registrados.
                      </div>
                   )}
                </div>

                {/* Lista de Abonos (Ya Pagado / Entradas) */}
                <div className="space-y-3">
                   <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Historial de Abonos / Pagos</h4>
                   {pagosRealizados.filter(p => mostrarArchivados ? true : (!p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'))).map(pago => {
                     const d = new Date(pago.fecha || new Date());
                     return (
                        <div key={pago.id} className={`p-4 rounded-2xl flex justify-between items-center group border ${pago.metodo.startsWith('Archivado') ? 'bg-neutral-900 border-neutral-800 opacity-60' : 'bg-emerald-950/10 border-emerald-900/30'}`}>
                          <div>
                            <p className={`${pago.metodo.startsWith('Archivado') ? 'text-neutral-500' : 'text-emerald-400'} font-black text-lg`}>+ ${pago.monto.toLocaleString()}</p>
                            <p className="text-[10px] text-neutral-500 uppercase font-bold">{pago.metodo.replace('Archivado: ', '')} • {d.toLocaleDateString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                               onClick={() => eliminarAbono(pago.id, pago.monto)} 
                               className="p-2 bg-red-500/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                               title="Eliminar abono"
                            >
                               <Trash2 size={16}/>
                            </button>
                            <div className={`p-2 rounded-lg ${pago.metodo.startsWith('Archivado') ? 'bg-neutral-800 text-neutral-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                               <TrendingDown size={16} className="rotate-180"/>
                            </div>
                          </div>
                       </div>
                     )
                   })}
                   {pagosRealizados.filter(p => mostrarArchivados ? true : (!p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'))).length === 0 && (
                      <div className="text-center py-12 text-neutral-500 border-2 border-dashed border-neutral-800 rounded-2xl">
                         No se han registrado abonos recientes.
                      </div>
                   )}
                </div>
              </div>
             )}
          </div>
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-center h-full text-neutral-600 bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
             <Banknote size={80} className="mb-6 opacity-20"/>
             <p className="text-2xl font-bold">Módulo de Cuentas Corrientes</p>
             <p className="mt-2 text-center max-w-sm">Busca un cliente frecuente a la izquierda para visualizar su estado de cuenta y registrar pagos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

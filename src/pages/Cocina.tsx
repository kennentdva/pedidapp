import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Check, Clock, Flame, UtensilsCrossed, Trash2, Edit2, PenLine, Bell, BellOff, ChevronDown, ChevronRight, Soup } from 'lucide-react';
import { type Pedido, useOrderStore } from '../store/orderStore';
import { useNavigate } from 'react-router-dom';
import { useKitchenNotifications } from '../hooks/useKitchenNotifications';
import { getColombiaDateString, getColombiaStartOfDay, getColombiaEndOfDay } from '../lib/dateUtils';

export default function Cocina() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState<string>(getColombiaDateString());
  const wakeLockRef = useRef<any>(null);
  const wakeLockTimeoutRef = useRef<any>(null);
  const { permission, requestPermission, notifyNewOrder, playTripleBeep, speakText, speakNewOrder } = useKitchenNotifications();
  const [toastNotificacion, setToastNotificacion] = useState<{ id: string, titulo: string, msj: string } | null>(null);
  
  // Ref para tener siempre la última data en el loop de voz (evitar stale closures)
  const stateRef = useRef({ pedidos: [] as Pedido[], resumenProteinas: {}, resumenSopas: {}, resumenArroz: {}, resumenMediaSopa: {}, resumenSoloSopaArroz: {}, resumenEspeciales: {}, pedidosPendientes: [] as Pedido[] });

  const fetchPedidos = async () => {
    try {
      setLoading(true);
      const startOfDay = getColombiaStartOfDay(fechaFiltro);
      const endOfDay = getColombiaEndOfDay(fechaFiltro);
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
          const msj = `${nuevo.beneficiario || 'Cliente'} — ${(nuevo.detalle as any)?.items ? (nuevo.detalle as any).items.length + ' ítems' : nuevo.detalle?.proteina ?? ''}`;
          notifyNewOrder('🍽️ Nuevo Pedido', msj);
          speakNewOrder(nuevo); // Solo narra el nuevo pedido
          setToastNotificacion({ id: Date.now().toString(), titulo: '🍽️ Nuevo Pedido', msj });
          setTimeout(() => setToastNotificacion(null), 5000); // Ocultar después de 5s
        }
        else if (payload.eventType === 'UPDATE') setPedidos(prev => prev.map(p => p.id === payload.new.id ? payload.new as Pedido : p));
        else if (payload.eventType === 'DELETE') setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fechaFiltro, notifyNewOrder]);


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
  
  const toggleItemCompletado = async (p: Pedido, index: number) => {
    const items = [...((p.detalle as any).items || [])];
    if (items[index]) {
      items[index].completado = !items[index].completado;
      const nuevoDetalle = { ...p.detalle, items };
      
      // Update local state for immediate feedback
      setPedidos(prev => prev.map(item => item.id === p.id ? { ...item, detalle: nuevoDetalle as any } : item));
      
      // Sync with Supabase
      await supabase.from('pedidos').update({ detalle: nuevoDetalle }).eq('id', p.id!);
    }
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

  // --- Lógica de Screen Wake Lock ---
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log("🔓 Screen Wake Lock activo");
        wakeLockRef.current.addEventListener('release', () => {
           wakeLockRef.current = null;
           console.log("🔒 Screen Wake Lock liberado");
        });
      } catch (err) {
        console.error("Error activando Wake Lock:", err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };


  // Helper: flatten items from a pedido (multi-item aware)
  const getItems = (p: Pedido): any[] => {
    const items = (p.detalle as any)?.items;
    if (items && Array.isArray(items) && items.length > 0) return items;
    return [{ 
      proteina: p.detalle?.proteina, 
      sopa: p.detalle?.sopa, 
      acompanamientos: p.detalle?.acompanamientos ?? [], 
      extras: p.detalle?.extras ?? [], 
      nota: p.detalle?.nota, 
      tipoPlato: p.detalle?.tipoPlato,
      valor: p.valor,
      cantidad: p.detalle?.cantidad || 1,
      completado: p.estado_cocina === 'empacado',
      mediaSopa: p.detalle?.mediaSopa
    }];
  };

  // Dashboard counters
  const totalHoy = pedidos.length;
  const yaEmpacados = pedidos.filter(p => p.estado_cocina === 'empacado').length;
  const faltaEmpacar = totalHoy - yaEmpacados;

  const pedidosPendientes = pedidos.filter(p => p.estado_cocina !== 'empacado');

  const resumenProteinas = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const prot = item?.proteina;
      const isCompletado = item?.completado === true;
      if (prot && !isCompletado && prot !== 'Solo Sopa' && item?.tipoPlato !== 'arroz' && item?.tipoPlato !== 'snack') {
        acc[prot] = (acc[prot] || 0) + (item.cantidad || 1);
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const resumenSopas = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const s = item?.sopa;
      const cant = item?.cantidad || 1;
      const isCompletado = item?.completado === true;
      if (s && !isCompletado) {
        acc[s] = (acc[s] || 0) + cant;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const resumenArroz = pedidosPendientes.reduce((acc, p) => {
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

  // NUEVO: Resumen de Media Sopa
  const resumenMediaSopa = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      if (item.mediaSopa && !item.completado && item.sopa) {
        acc[item.sopa] = (acc[item.sopa] || 0) + (item.cantidad || 1);
      }
    });
    return acc;
  }, {} as Record<string, number>);

  // NUEVO: Resumen de Solo Sopa con Arroz
  const resumenSoloSopaArroz = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      if (item.proteina === 'Solo Sopa' && item.acompanamientos?.includes('Arroz') && !item.completado) {
        acc['Solo Sopa con Arroz'] = (acc['Solo Sopa con Arroz'] || 0) + (item.cantidad || 1);
      }
    });
    return acc;
  }, {} as Record<string, number>);

  // --- Efecto de Screen Wake Lock ---
  useEffect(() => {
    const hayPedidos = pedidosPendientes.length > 0;

    if (hayPedidos) {
      if (wakeLockTimeoutRef.current) {
        clearTimeout(wakeLockTimeoutRef.current);
        wakeLockTimeoutRef.current = null;
      }
      requestWakeLock();
    } else {
      if (!wakeLockTimeoutRef.current) {
        wakeLockTimeoutRef.current = setTimeout(() => {
          releaseWakeLock();
          wakeLockTimeoutRef.current = null;
        }, 12 * 60 * 1000); 
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && pedidosPendientes.length > 0) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pedidosPendientes.length]);

  const totalSopas = pedidos.reduce((acc, p) => { 
    if (p.estado_cocina === 'empacado') return acc;
    getItems(p).forEach(it => { 
      // Si tiene sopa definida explícitamente o si es un plato de "Solo Sopa"
      if ((it?.sopa || it?.proteina === 'Solo Sopa') && !it.completado) acc += (it.cantidad || 1); 
    }); 
    return acc; 
  }, 0);

  const totalProteinas = pedidos.reduce((acc, p) => { 
    if (p.estado_cocina === 'empacado') return acc;
    getItems(p).forEach(it => { if (it?.proteina && it?.proteina !== 'Solo Sopa' && it?.tipoPlato !== 'arroz' && it?.tipoPlato !== 'snack' && !it.completado) acc += (it.cantidad || 1); }); 
    return acc; 
  }, 0);
  
  // Total de arroces (sumando cantidades reales)
  const totalArroces = pedidos.reduce((acc, p) => { 
    getItems(p).forEach(it => { 
      if (it?.tipoPlato === 'arroz') {
        acc += it.cantidad || 1;
      }
    }); 
    return acc; 
  }, 0);

  // Helper para saber si un plato está completo
  const getEstadoPlato = (item: any) => {
    if (item.tipoPlato === 'arroz' || item.tipoPlato === 'snack' || item.proteina === 'Solo Sopa') return { completa: true, completaBot: true, faltantes: [], faltantesBot: [] };
    
    const acc = item.acompanamientos || [];
    const faltantes = [];
    const faltantesBot = []; // Para el bot, ignoramos papa/patacón

    if (!acc.includes('Arroz')) { faltantes.push('Arroz'); faltantesBot.push('Arroz'); }
    if (!acc.includes('Ensalada')) { faltantes.push('Ensalada'); faltantesBot.push('Ensalada'); }
    
    const tienePrincipe = acc.some((a: string) => ['Papas', 'Patacón', 'Frijol', 'Yuca', 'Tajadas', 'Maduro'].includes(a));
    if (!tienePrincipe) {
      faltantes.push('Acompañamiento (Papa/Patacón)');
      faltantesBot.push('acompañante');
    }

    return { 
      completa: faltantes.length === 0, 
      completaBot: faltantesBot.length === 0, 
      faltantes, 
      faltantesBot 
    };
  };



  const resumenEspeciales = pedidosPendientes.reduce((acc, p) => {
    getItems(p).forEach(item => {
      const { completaBot, faltantesBot } = getEstadoPlato(item);
      if (!completaBot && item.proteina !== 'Solo Sopa') {
        const desc = `${item.proteina} sin ${faltantesBot.join(' ni ')}`;
        acc[desc] = (acc[desc] || 0) + (item.cantidad || 1);
      }
    });
    return acc;
  }, {} as Record<string, number>);

  // Actualizar el ref en cada render (después de que se declaren las variables)
  useEffect(() => {
    stateRef.current = { 
      pedidos, 
      resumenProteinas, 
      resumenSopas, 
      resumenArroz, 
      resumenMediaSopa, 
      resumenSoloSopaArroz, 
      resumenEspeciales, 
      pedidosPendientes 
    };
  }, [pedidos, resumenProteinas, resumenSopas, resumenArroz, resumenMediaSopa, resumenSoloSopaArroz, resumenEspeciales, pedidosPendientes]);

  const totalEspeciales = Object.values(resumenEspeciales).reduce((a, b) => a + b, 0);



  const timerRef = useRef<any>(null);

  // Función para programar la próxima narración
  const programarProximaNarracion = (delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      narrarResumenDetallado(true);
    }, delayMs);
  };

  // Función para narrar el resumen detallado
  const narrarResumenDetallado = (autoSchedule = false) => {
    const { 
       pedidosPendientes: pps, 
       resumenSopas: rSs, 
       resumenArroz: rAs, 
       resumenMediaSopa: rMS, 
       resumenSoloSopaArroz: rSSA 
    } = stateRef.current;

    if (pps.length === 0) {
      // Si no hay pedidos, no programar la siguiente. El useEffect la reiniciará cuando llegue uno.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Reproducir tono triple antes de hablar
    playTripleBeep();

    let texto = `Resumen actual. `;
    
    // 1. Sopas
    const sops = Object.entries(rSs);
    if (sops.length > 0) {
      const parts = sops.map(([s, c]) => {
        const medias = (rMS as any)[s] || 0;
        if (medias > 0) {
          if (medias === c) return `${c} ${s} que ${c === 1 ? 'es media' : 'son medias'}`;
          // Frase: "X [sopa], de los cuales Y [sopa] es media"
          return `${c} ${s}, de las cuales ${medias} ${medias === 1 ? s + ' es media' : s + ' son medias'}`;
        }
        return `${c} ${s}`;
      });
      texto += `Tenemos ${parts.join(' y ')}. `;
    }

    // 2. Proteínas Agrupadas
    interface InfoProt { total: number; completas: number; variaciones: Record<string, number> }
    const protsAgrupadas: Record<string, InfoProt> = {};

    pps.forEach(p => {
      getItems(p).forEach(it => {
        const prot = it?.proteina;
        const cant = it?.cantidad || 1;
        const isCompletado = it?.completado === true;
        
        if (prot && !isCompletado && prot !== 'Solo Sopa' && it?.tipoPlato !== 'arroz' && it?.tipoPlato !== 'snack') {
          if (!protsAgrupadas[prot]) protsAgrupadas[prot] = { total: 0, completas: 0, variaciones: {} };
          
          protsAgrupadas[prot].total += cant;
          
          const acc = it.acompanamientos || [];
          const tienePrincipe = acc.some((a: string) => ['Papas', 'Patacón', 'Frijol', 'Yuca', 'Tajadas', 'Maduro'].includes(a));
          const faltantesBot = [];
          if (!acc.includes('Arroz')) faltantesBot.push('Arroz');
          if (!acc.includes('Ensalada')) faltantesBot.push('Ensalada');
          if (!tienePrincipe) faltantesBot.push('acompañante');
          
          const completaBot = faltantesBot.length === 0;
          
          if (completaBot) {
            protsAgrupadas[prot].completas += cant;
          } else {
            const soloKey = `solo ${prot}`;
            const desc = faltantesBot.length === 3 ? soloKey : `sin ${faltantesBot.join(' ni ')}`;
            protsAgrupadas[prot].variaciones[desc] = (protsAgrupadas[prot].variaciones[desc] || 0) + cant;
          }
        }
      });
    });

    const entriesProts = Object.entries(protsAgrupadas);
    if (entriesProts.length > 0) {
      const frases = entriesProts.map(([p, info]) => {
        const soloKey = `solo ${p}`;
        const totalSolo = info.variaciones[soloKey] || 0;

        if (info.total === totalSolo) {
          return `${info.total} ${p} que ${info.total === 1 ? 'es solo la proteína' : 'son solo la proteína'}`;
        }
        if (info.total === info.completas) {
          return `${info.total} ${p} con todo`;
        }

        const det = [];
        if (info.completas > 0) det.push(`${info.completas} ${info.completas === 1 ? 'con todo' : 'con todo'}`);
        Object.entries(info.variaciones).forEach(([d, c]) => {
          const descFinal = d === soloKey ? `${c === 1 ? 'una es' : c + ' son'} solo la proteína` : d;
          det.push(`${c} ${descFinal}`);
        });
        return `${info.total} ${p}, de las cuales<sup>*</sup> ${det.join(' y ')}`;
      });
      texto += `En platos normales hay: ${frases.join(' y ').replace('<sup>*</sup>', '')}. `;
    }

    // 3. Arroces
    const arroces = Object.entries(rAs);
    if (arroces.length > 0) {
      const frasesArr = arroces.map(([n, i]: [string, any]) => {
        const det = [];
        if (i.grande > 0) det.push(`${i.grande} ${i.grande === 1 ? 'grande' : 'grandes'}`);
        if (i.pequeña > 0) det.push(`${i.pequeña} ${i.pequeña === 1 ? 'pequeña' : 'pequeñas'}`);
        return `${i.total} ${n} (${det.join(' y ')})`;
      });
      texto += `En platos de arroz hay: ${frasesArr.join(' y ')}. `;
    }


    // 5. Solo Sopa con Arroz
    const ssos = Object.entries(rSSA);
    if (ssos.length > 0) {
      texto += `También hay ${ssos.map(([desc, cant]: [string, any]) => `${cant} ${desc}`).join(', ')}. `;
    }

    speakText(texto, () => {
      if (autoSchedule) {
        const interval = useOrderStore.getState().menuConfig.narratorInterval || 15;
        programarProximaNarracion(interval * 60 * 1000);
      }
    });
  };

  // Recordatorio periódico: Iniciar ciclo cuando hay pedidos, detener cuando no
  useEffect(() => {
    const hayPedidos = pedidosPendientes.length > 0;

    if (hayPedidos && !timerRef.current) {
      // Iniciar el ciclo de narración
      narrarResumenDetallado(true);
    } else if (!hayPedidos && timerRef.current) {
      // Detener el ciclo si la lista se vacía
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pedidosPendientes.length]);

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100 gap-6">
      
      <h3 className="text-sm uppercase tracking-widest font-bold text-neutral-500 ml-2">Vista General de Producción (Hoy)</h3>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-2 w-full">
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Proteínas</span>
            <span className="text-xl font-black text-orange-400">{totalProteinas}</span>
         </div>
         <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 shadow flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Sopas (Pendientes)</span>
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
      
      <div className="flex flex-col gap-4">
        <Accordion title="1. Proteínas Pendientes" icon={<UtensilsCrossed size={16}/>} count={Object.values(resumenProteinas).reduce((a,b)=>a+b,0)}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {Object.entries(resumenProteinas).map(([prot, cant]) => (
              <div key={prot} className="flex justify-between items-center bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-xl">
                <span className="text-xs font-bold text-neutral-400">{prot}</span>
                <span className="text-sm font-black text-orange-400">{cant}</span>
              </div>
            ))}
          </div>
        </Accordion>

        <Accordion title="2. Sopas (Enteras)" icon={<Soup size={16}/>} count={Object.entries(resumenSopas).filter(([k]) => !k.startsWith('Media')).reduce((a,b)=>a+b[1],0)}>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
             {Object.entries(resumenSopas).filter(([k]) => !k.startsWith('Media')).map(([sopa, cant]) => (
               <div key={sopa} className="flex justify-between items-center bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-xl">
                 <span className="text-xs font-bold text-neutral-400">{sopa}</span>
                 <span className="text-sm font-black text-amber-500">{cant}</span>
               </div>
             ))}
           </div>
        </Accordion>

        <Accordion title="3. MEDIA SOPA 🥣" icon={<Soup size={16}/>} count={Object.values(resumenMediaSopa).reduce((a,b)=>a+b,0)} color="amber">
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
             {Object.entries(resumenMediaSopa).map(([sopa, cant]) => (
               <div key={sopa} className="flex justify-between items-center bg-amber-950/20 border border-amber-900/40 px-3 py-2 rounded-xl">
                 <span className="text-xs font-bold text-amber-500">{sopa}</span>
                 <span className="text-sm font-black text-white">{cant}</span>
               </div>
             ))}
           </div>
        </Accordion>

        <Accordion title="4. SOLO SOPA CON ARROZ 🍚" icon={<Check size={16}/>} count={resumenSoloSopaArroz['Solo Sopa con Arroz'] || 0} color="blue">
           <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-2xl flex justify-between items-center">
             <span className="text-sm font-bold text-blue-400 uppercase tracking-widest italic">Combinación Especial de Sopa y Arroz</span>
             <span className="text-3xl font-black text-white">{resumenSoloSopaArroz['Solo Sopa con Arroz'] || 0}</span>
           </div>
        </Accordion>

        <Accordion title="5. Arroces Especiales" icon={<UtensilsCrossed size={16}/>} count={Object.values(resumenArroz).reduce((a,b)=>a+b.total,0)} color="yellow">
           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
             {Object.entries(resumenArroz).map(([nombre, info]) => (
               <div key={nombre} className="bg-yellow-950/20 border border-yellow-900/30 p-3 rounded-2xl flex flex-col items-center">
                 <span className="text-xs font-bold text-yellow-500 mb-1">{nombre}</span>
                 <div className="flex gap-4">
                   <div className="text-center"><span className="text-[10px] block text-neutral-500">PEQ</span><span className="font-bold text-white">{info.pequeña}</span></div>
                   <div className="text-center"><span className="text-[10px] block text-neutral-500">GRA</span><span className="font-bold text-white">{info.grande}</span></div>
                 </div>
               </div>
             ))}
           </div>
        </Accordion>

        <Accordion title={`6. Platos Especiales / Sin Algo (${totalEspeciales})`} icon={<BellOff size={16}/>} count={totalEspeciales} color="red">
           <div className="flex flex-col gap-2">
              {Object.entries(resumenEspeciales).map(([desc, cant]) => (
                <div key={desc} className="bg-red-950/30 border border-red-900/40 px-3 py-2 rounded-xl flex justify-between items-center">
                  <span className="text-xs font-bold text-red-300">{desc}</span>
                  <span className="text-lg font-black text-white">{cant}</span>
                </div>
              ))}
              {totalEspeciales === 0 && <span className="text-xs text-neutral-500 italic">No hay pedidos especiales</span>}
           </div>
        </Accordion>
      </div>

      <div className="flex items-center justify-between mb-2 px-2 mt-2">
         <h2 className="text-2xl font-bold flex items-center gap-2"><ChefHat size={24} className="text-orange-500" /> Lista de Producción</h2>
         <div className="flex items-center gap-2">
           {/* Notification Bell */}
           <button
             onClick={requestPermission}
             title={
               permission === 'granted' ? 'Notificaciones activas'
               : permission === 'denied' ? 'Notificaciones bloqueadas — habilita en configuración del navegador'
               : permission === 'unsupported' ? 'Tu navegador no soporta notificaciones'
               : 'Activar notificaciones de nuevos pedidos'
             }
             className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors ${
               permission === 'granted'
                 ? 'bg-emerald-500/20 border-emerald-700/50 text-emerald-400'
                 : permission === 'denied'
                 ? 'bg-red-500/20 border-red-700/50 text-red-400 cursor-not-allowed'
                 : permission === 'unsupported'
                 ? 'bg-neutral-800 border-neutral-700 text-neutral-600 cursor-not-allowed'
                 : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-amber-400 hover:border-amber-900/50 cursor-pointer animate-pulse'
             }`}
           >
             {permission === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
              <span className="hidden md:block">
                {permission === 'granted' ? 'Notificaciones ON'
                 : permission === 'denied' ? 'Bloqueadas'
                 : permission === 'unsupported' ? 'No soportado'
                 : 'Activar Alertas'}
              </span>
            </button>
            
            {/* Prueba de Sonido/Voz */}
            <button
               onClick={() => narrarResumenDetallado()}
               className="p-2 rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white transition-colors flex items-center gap-2"
               title="Probar Resumen de Voz"
             >
               <UtensilsCrossed size={16} />
               <span className="text-[10px] font-bold">PROBAR RESUMEN</span>
             </button>

             {/* Narrator Interval Select */}
             <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl" title="Intervalo de voz en minutos">
                <Clock size={14} className="text-neutral-500" />
                <select 
                  value={useOrderStore(state => state.menuConfig).narratorInterval || 15}
                  onChange={(e) => useOrderStore.getState().setMenuConfig({ narratorInterval: Number(e.target.value) })}
                  className="bg-transparent text-white outline-none border-none text-[10px] font-bold cursor-pointer"
                >
                  <option value={1} className="bg-neutral-900">1 min (Test)</option>
                  <option value={5} className="bg-neutral-900">5 min</option>
                  <option value={10} className="bg-neutral-900">10 min</option>
                  <option value={15} className="bg-neutral-900">15 min</option>
                  <option value={20} className="bg-neutral-900">20 min</option>
                  <option value={30} className="bg-neutral-900">30 min</option>
                </select>
             </div>
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
                      {((p.detalle as any).items as any[]).map((item: any, idx: number) => {
                        const isDone = item.completado;
                        const isSoloSopaArroz = item.proteina === 'Solo Sopa' && item.acompanamientos?.includes('Arroz');
                        return (
                          <div 
                            key={idx} 
                            onClick={() => toggleItemCompletado(p, idx)}
                            className={`rounded-xl p-2 border cursor-pointer transition-all ${isDone ? 'bg-emerald-900/20 border-emerald-500/30 opacity-60' : isSoloSopaArroz ? 'bg-blue-900/20 border-blue-500/50 shadow-lg shadow-blue-500/10' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-600'}`}
                          >
                            <p className={`flex justify-between text-sm ${isDone ? 'line-through text-neutral-500' : ''}`}>
                              <span className="text-neutral-500">{item.tipoPlato === 'arroz' ? '🍚' : item.tipoPlato === 'snack' ? '🍦' : '🍗'}</span>
                              <span className={`font-bold text-right ${isSoloSopaArroz ? 'text-blue-400' : 'text-white'}`}>
                                {(item.cantidad || 1) > 1 && <span className="text-orange-400 mr-1">{item.cantidad}x</span>}
                                {item.proteina}
                              </span>
                            </p>
                            {isSoloSopaArroz && !isDone && (
                              <div className="text-[10px] font-black text-blue-400 text-right uppercase tracking-tighter mt-1 italic animate-pulse">
                                ⭐ COMBO SOPA Y ARROZ
                              </div>
                            )}
                            {item.sopa && (
                              <p className={`text-xs text-orange-400 text-right mt-0.5 ${isDone ? 'line-through opacity-50' : ''}`}>
                                🍲 {item.mediaSopa ? 'Media ' : ''}{item.sopa}
                              </p>
                            )}
                            {item.acompanamientos?.length > 0 && <p className={`text-xs text-neutral-500 text-right ${isDone ? 'line-through opacity-50' : ''}`}>{item.acompanamientos.join(', ')}</p>}
                            
                            {/* Alertas de platos completos vs especiales */}
                            {(() => {
                              const { completa, faltantes } = getEstadoPlato(item);
                              if (item.tipoPlato === 'arroz' || item.tipoPlato === 'snack' || item.proteina === 'Solo Sopa') return null;
                              if (completa) return <div className="flex justify-end mt-1"><span className="text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded">PLATO COMPLETO ✅</span></div>;
                              return (
                                <div className="flex flex-wrap gap-1 justify-end mt-1">
                                  {faltantes.map(f => (
                                    <span key={f} className="text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse">SIN {f.toUpperCase()} 🚫</span>
                                  ))}
                                </div>
                              );
                            })()}
                            
                            {item.nota && <p className="text-xs text-yellow-400 italic mt-1">⚠️ {item.nota}</p>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Single-item legacy display
                    <>
                      <p className="flex justify-between"><span className="text-neutral-500">{p.detalle?.tipoPlato === 'arroz' ? 'Arroz Especial:' : 'Proteína:'}</span> <span className="font-bold text-white text-lg">{p.detalle?.proteina}</span></p>
                      <p className="flex justify-between"><span className="text-neutral-500">Acompañ.:</span> <span className="text-right text-sm">{p.detalle?.acompanamientos?.join(', ')}</span></p>
                      <div className="flex justify-between items-center py-2 px-3 bg-neutral-950 rounded-xl border border-neutral-800">
                        <span className="text-neutral-500 text-xs font-bold uppercase">Sopa:</span>
                        <div className="flex flex-col items-end">
                          <span className={`font-black text-sm uppercase ${p.detalle?.sopa ? 'text-orange-400' : 'text-neutral-700'}`}>{p.detalle?.sopa ? `🍲 ${p.detalle.sopa}` : 'Sin sopa'}</span>
                          {p.detalle?.sopa && p.detalle.mediaSopa && (
                            <span className="text-[10px] font-black bg-amber-500 text-white px-1.5 rounded-full mt-1 animate-pulse italic">🥣 MEDIA (MITAD)</span>
                          )}
                        </div>
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

function Accordion({ title, icon, count, children, color = 'neutral' }: { title: string, icon: React.ReactNode, count: number, children: React.ReactNode, color?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const colors: Record<string, string> = {
    neutral: 'bg-neutral-900 border-neutral-800',
    amber: 'bg-amber-950/10 border-amber-900/30',
    yellow: 'bg-yellow-950/10 border-yellow-900/30',
    blue: 'bg-blue-950/10 border-blue-900/30',
    red: 'bg-red-950/10 border-red-900/20',
  };

  const textColors: Record<string, string> = {
    neutral: 'text-neutral-400',
    amber: 'text-amber-500',
    yellow: 'text-yellow-500',
    blue: 'text-blue-400',
    red: 'text-red-400',
  };

  return (
    <div className={`rounded-3xl border overflow-hidden transition-all duration-300 ${colors[color]} ${isOpen ? 'shadow-2xl' : 'shadow-lg mb-2'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl bg-black/40 ${textColors[color]}`}>{icon}</div>
          <h4 className={`font-black text-sm uppercase tracking-widest ${textColors[color]}`}>{title}</h4>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xl font-black text-white">{count}</span>
          {isOpen ? <ChevronDown className="text-neutral-600" size={20} /> : <ChevronRight className="text-neutral-600" size={20} />}
        </div>
      </button>
      {isOpen && (
        <div className="px-6 pb-6 pt-2 animate-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}

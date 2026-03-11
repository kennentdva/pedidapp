import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Wallet, Search, TrendingDown, CalendarDays, Banknote, DollarSign, Share2, Trash2, Download, FileText, Check, X, MessageCircle, Edit2 } from 'lucide-react';
import { type Cliente, type Pedido, MENU_CONFIG_ID, useOrderStore } from '../store/orderStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Cuentas() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historialPedidos, setHistorialPedidos] = useState<Pedido[]>([]);
  const [pagosRealizados, setPagosRealizados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deudaGlobal, setDeudaGlobal] = useState(0);
  const [deudoresList, setDeudoresList] = useState<{cliente: Cliente, deuda: number}[]>([]);
  const [editingPrecioId, setEditingPrecioId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number | string>('');
  const [editingClientName, setEditingClientName] = useState(false);
  const [tempClientName, setTempClientName] = useState('');

  // Formulario Pago
  const [montoPago, setMontoPago] = useState<number | string>('');
  const [metodo, setMetodo] = useState<'Efectivo' | 'Transferencia'>('Efectivo');
  const [savingPayment, setSavingPayment] = useState(false);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);

  // Formulario Deuda Histórica
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [histFecha, setHistFecha] = useState(new Date().toISOString().split('T')[0]);
  const [histProteina, setHistProteina] = useState('');
  const [histSopa, setHistSopa] = useState('');
  const [histAcomp, setHistAcomp] = useState<string[]>([]);
  const [histExtrasText, setHistExtrasText] = useState('');
  const [histPrecio, setHistPrecio] = useState<number | string>('');
  const [savingHistorico, setSavingHistorico] = useState(false);
  
  // Formulario Masivo (Parser)
  const [mostrarModalMasivo, setMostrarModalMasivo] = useState(false);
  const [textoMasivo, setTextoMasivo] = useState('');
  const [fechaMasiva, setFechaMasiva] = useState(new Date().toISOString().split('T')[0]);
  const [itemsMasivos, setItemsMasivos] = useState<any[]>([]);
  const [savingMasivo, setSavingMasivo] = useState(false);
  const [stepMasivo, setStepMasivo] = useState<'input' | 'review'>('input');

  const menuConfig = useOrderStore(state => state.menuConfig);

  useEffect(() => {
    fetchClientes();
    fetchDeudaGlobal();
  }, []);

  const fetchDeudaGlobal = async () => {
    // Calculamos la deuda global igual que en el PDF (por cliente, sin dejar saldos negativos)
    const { data: clientesData } = await supabase.from('clientes').select('*');
    const { data: pedidosData, error: errP } = await supabase.from('pedidos').select('responsable_id, valor, pagado');
    const { data: pagosData, error: errPag } = await supabase.from('pagos').select('cliente_id, monto, metodo');
    
    if (clientesData && pedidosData && pagosData) {
      let totalGlobal = 0;
      const listDeudores: {cliente: Cliente, deuda: number}[] = [];

      clientesData.forEach(cliente => {
        if (cliente.id === MENU_CONFIG_ID) return;
        const pedCli = pedidosData.filter(p => !p.pagado && p.responsable_id === cliente.id);
        const pagCli = pagosData.filter(p => p.cliente_id === cliente.id && !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'));

        const sumConsumo = pedCli.reduce((acc, p) => acc + p.valor, 0);
        const sumAbonos = pagCli.reduce((acc, p) => acc + p.monto, 0);
        const deudaNeta = Math.max(0, sumConsumo - sumAbonos);

        if (deudaNeta > 0) {
          totalGlobal += deudaNeta;
          listDeudores.push({ cliente: cliente as Cliente, deuda: deudaNeta });
        }
      });
      setDeudaGlobal(totalGlobal);
      setDeudoresList(listDeudores.sort((a, b) => b.deuda - a.deuda));
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

  const guardarNombreCliente = async () => {
    if (!selectedCliente) return;
    const nuevoNombre = tempClientName.trim() || 'Cliente Sin Nombre';
    const { error } = await supabase.from('clientes').update({ nombre: nuevoNombre }).eq('id', selectedCliente.id);
    if (!error) {
       setSelectedCliente({ ...selectedCliente, nombre: nuevoNombre });
       fetchClientes(); // Refresh list
    }
    setEditingClientName(false);
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

  const procesarDeudaHistorica = async () => {
    if (!selectedCliente) return;
    const valor = typeof histPrecio === 'string' ? parseFloat(histPrecio) : histPrecio;
    if (!histFecha || !histProteina || !valor || valor <= 0) return alert('Fecha, Proteína y Valor son obligatorios.');

    setSavingHistorico(true);

    const extrasArray = histExtrasText.split(',').map(e => e.trim()).filter(e => e.length > 0);

    const nuevoPedidoHistorico = {
      responsable_id: selectedCliente.id,
      beneficiario: selectedCliente.nombre,
      detalle: {
        proteina: histProteina,
        acompanamientos: histAcomp,
        sopa: histSopa || null,
        extras: extrasArray
      },
      valor: valor,
      estado_cocina: 'empacado',
      estado_entrega: 'entregado',
      pagado: false,
      created_at: new Date(histFecha + 'T12:00:00').toISOString() // Simulamos medio día para evitar timezone issues
    };

    const { error } = await supabase.from('pedidos').insert([nuevoPedidoHistorico]);

    if (!error) {
       alert('Deuda histórica agregada correctamente.');
       setMostrarHistorico(false);
       // Reset form
       setHistProteina(''); setHistSopa(''); setHistAcomp([]); setHistExtrasText(''); setHistPrecio(''); setHistFecha(new Date().toISOString().split('T')[0]);
       
       seleccionarCliente(selectedCliente);
       fetchDeudaGlobal();
    } else {
       alert('Error al agregar el pedido histórico.');
    }
    setSavingHistorico(false);
  };

  const analizarTextoMasivo = () => {
    if (!textoMasivo.trim()) return;
    
    const lineas = textoMasivo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedItems: any[] = [];

    lineas.forEach((linea, index) => {
       const lowerLinea = linea.toLowerCase();
       let isPagado = false;
       
       // Detectar si está pagado
       if (lowerLinea.includes('pago') || lowerLinea.includes('pagó') || lowerLinea.includes('cancelo') || lowerLinea.includes('canceló')) {
          isPagado = true;
       }

       // Intentar encontrar proteína
       let proteinaEncontrada = menuConfig.proteinas.find(p => lowerLinea.includes(p.toLowerCase())) || 'Corriente';
       
       // Intentar encontrar sopa
       let sopaEncontrada = lowerLinea.includes('sin sopa') ? '' : (lowerLinea.includes('sopa') ? (menuConfig.sopas[0] || 'Sopa del día') : '');
       
       // Limpiar un poco el nombre (estrategia súper básica: tomar las primeras palabras antes de encontrar comida)
       const palabras = linea.split(' ');
       let posibleNombre = '';
       for (const word of palabras) {
          const wLow = word.toLowerCase();
          if (menuConfig.proteinas.some(p => p.toLowerCase().includes(wLow)) || 
              wLow === 'con' || wLow === 'sin' || wLow === 'sopa' || wLow === 'pago') {
             break;
          }
          posibleNombre += word + ' ';
       }
       posibleNombre = posibleNombre.trim() || `Usuario ${index + 1}`;

       // Buscar cliente existente
       const clienteExistente = clientes.find(c => c.nombre.toLowerCase().includes(posibleNombre.toLowerCase()) || posibleNombre.toLowerCase().includes(c.nombre.toLowerCase()));

       parsedItems.push({
          id_temp: Date.now() + index,
          originalLinea: linea,
          clienteId: clienteExistente ? clienteExistente.id : 'NUEVO',
          nuevoNombreCliente: clienteExistente ? '' : posibleNombre,
          proteina: proteinaEncontrada,
          sopa: sopaEncontrada,
          pagado: isPagado,
          // Precio sugerido básico (se puede editar)
          precio: sopaEncontrada ? 15000 : 13000
       });
    });

    setItemsMasivos(parsedItems);
    setStepMasivo('review');
  };

  const guardarMasivo = async () => {
    setSavingMasivo(true);
    let errores = 0;

    for (const item of itemsMasivos) {
       let idAUsar = item.clienteId;
       let nombreAUsar = '';

       // Si es cliente nuevo, crearlo en BD
       if (idAUsar === 'NUEVO') {
          if (!item.nuevoNombreCliente) item.nuevoNombreCliente = 'Desconocido';
          nombreAUsar = item.nuevoNombreCliente;
          const { data: newC } = await supabase.from('clientes').insert([{ nombre: nombreAUsar }]).select();
          if (newC && newC.length > 0) {
             idAUsar = newC[0].id;
          } else {
             errores++;
             continue; // Saltar si falla la creación
          }
       } else {
          nombreAUsar = clientes.find(c => c.id === idAUsar)?.nombre || 'Desconocido';
       }

       // Crear el Pedido
       const nuevoPedido = {
         responsable_id: idAUsar,
         beneficiario: nombreAUsar,
         detalle: {
           proteina: item.proteina,
           acompanamientos: [],
           sopa: item.sopa || null,
           extras: [item.originalLinea] // Guardamos toda la línea como nota por si acaso
         },
         valor: Number(item.precio) || 0,
         estado_cocina: 'empacado',
         estado_entrega: 'entregado',
         pagado: item.pagado,
         created_at: new Date(fechaMasiva + 'T12:00:00').toISOString()
       };

       const { data: pedData, error: pedErr } = await supabase.from('pedidos').insert([nuevoPedido]).select();

       if (pedErr) {
          errores++;
       } else if (item.pagado && pedData && pedData.length > 0) {
          // Si estaba marcado como pagado, generar también el abono para saldar la cuenta
          await supabase.from('pagos').insert([{
             cliente_id: idAUsar,
             monto: Number(item.precio) || 0,
             metodo: 'Saldado: Efectivo (Importado)'
          }]);
       }
    }

    setSavingMasivo(false);
    if (errores > 0) {
       alert(`Proceso finalizado, pero hubo ${errores} errores al insertar pedidos.`);
    } else {
       alert('Todos los pedidos importados correctamente.');
       setMostrarModalMasivo(false);
       setTextoMasivo('');
       setItemsMasivos([]);
       setStepMasivo('input');
       fetchClientes(); // Para traer los nuevos creados
       fetchDeudaGlobal();
       if (selectedCliente) seleccionarCliente(selectedCliente);
    }
  };

  const generarReporteText = () => {
    if (!selectedCliente || historialPedidos.length === 0) return;
    
    // El total consumido menos lo pagado
    const deuda = calcularDeudaTotal();
    if (deuda <= 0) return alert('Este cliente no tiene deudas pendientes.');
    
    let texto = `*Restaurante Mayiya*\n\nHola ${(selectedCliente.nombre || 'Cliente').trim()}, te compartimos tu estado de cuenta a la fecha.\n\n`;
    
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
    
    texto += `\n*TOTAL DEUDA: $${deuda.toLocaleString()}*\n\nSi deseas transferir, puedes hacerlo a:\nNequi: 3044118649\n(Esta misma llave sirve si transfieres desde otro banco)`;
    
    return texto;
  };

  const copiarReporte = () => {
    const texto = generarReporteText();
    if (texto) {
       navigator.clipboard.writeText(texto);
       alert('Reporte copiado al portapapeles.');
    }
  };

  const enviarWhatsApp = () => {
    const texto = generarReporteText();
    if (texto) {
       const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
       window.open(url, '_blank');
    }
  };

  const generarReporteGlobalPDF = async () => {
    try {
      setLoading(true);
      const { data: clientesData } = await supabase.from('clientes').select('*');
      const { data: pedidosData } = await supabase.from('pedidos').select('responsable_id, valor, pagado');
      const { data: pagosData } = await supabase.from('pagos').select('cliente_id, monto, metodo');

      if (!clientesData || !pedidosData || !pagosData) throw new Error("Datos no disponibles");

      const tablaDeudas: any[] = [];
      let deudaTotalGlobal = 0;

      clientesData.forEach(cliente => {
         if (cliente.id === MENU_CONFIG_ID) return;

         const pedCli = pedidosData.filter(p => !p.pagado && p.responsable_id === cliente.id);
         const pagCli = pagosData.filter(p => p.cliente_id === cliente.id && !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'));

         const sumConsumo = pedCli.reduce((acc, p) => acc + p.valor, 0);
         const sumAbonos = pagCli.reduce((acc, p) => acc + p.monto, 0);
         const deudaNeta = Math.max(0, sumConsumo - sumAbonos);

         if (deudaNeta > 0) {
            deudaTotalGlobal += deudaNeta;
            tablaDeudas.push([
              cliente.nombre,
              cliente.es_frecuente ? 'Sí' : 'No',
              `$${deudaNeta.toLocaleString()}`
            ]);
         }
      });

      tablaDeudas.sort((a, b) => {
         const numA = Number(a[2].replace(/[$,]/g, ''));
         const numB = Number(b[2].replace(/[$,]/g, ''));
         return numB - numA;
      });

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Reporte Global de Deudas - PedidApp", 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Fecha de generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30);

      autoTable(doc, {
        startY: 35,
        head: [['Cliente', 'Frecuente', 'Deuda Neta ($)']],
        body: tablaDeudas,
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38] },
        foot: [['', 'TOTAL GLOBAL', `$${deudaTotalGlobal.toLocaleString()}`]],
        footStyles: { fillColor: [40, 40, 40], fontStyle: 'bold' }
      });

      doc.save(`Deudas_Globales_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Error al generar PDF");
    } finally {
      setLoading(false);
    }
  };

  const generarReporteIndividualPDF = () => {
    if (!selectedCliente || historialPedidos.length === 0) return;
    
    const deuda = calcularDeudaTotal();
    
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Estado de Cuenta: ${(selectedCliente.nombre || 'Sin Nombre').trim()}`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Fecha: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30);
    
    const pedidosPendientes = mostrarArchivados ? historialPedidos : historialPedidos.filter(p => !p.pagado);
    const tablaConsumos = pedidosPendientes.map(p => {
       const d = new Date(p.created_at || '').toLocaleDateString();
       let detalleStr = p.detalle?.proteina || '';
       if (p.detalle?.sopa) detalleStr += ` + Sopa ${p.detalle.sopa}`;
       if (p.detalle?.extras && p.detalle.extras.length > 0) detalleStr += ` + Extras: ${p.detalle.extras.join(', ')}`;
       return [
         d,
         detalleStr,
         `$${p.valor.toLocaleString()}`
       ];
    });

    let finalY = 35;

    if (tablaConsumos.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Detalles de Consumo", 14, finalY);
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Fecha', 'Descripción', 'Valor']],
        body: tablaConsumos,
        theme: 'striped',
        margin: { bottom: 10 }
      });
      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    const abonosGenerales = mostrarArchivados ? pagosRealizados : pagosRealizados.filter(p => !p.metodo.startsWith('Saldado') && !p.metodo.startsWith('Archivado'));
    const tablaAbonos = abonosGenerales.map(pago => [
       new Date(pago.fecha || new Date()).toLocaleDateString(),
       pago.metodo,
       `$${pago.monto.toLocaleString()}`
    ]);

    if (tablaAbonos.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Historial de Abonos", 14, finalY);
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Fecha', 'Método', 'Monto']],
        body: tablaAbonos,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        margin: { bottom: 10 }
      });
      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.setFontSize(16);
    doc.setTextColor(220, 38, 38);
    doc.text(`TOTAL DEUDA NETA: $${deuda.toLocaleString()}`, 14, finalY + 5);

    doc.save(`Estado_Cuenta_${(selectedCliente.nombre || 'Sin_Nombre').trim().replace(/\s/g, '_')}.pdf`);
  };

  const deudaVisible = calcularDeudaTotal();

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-2 md:p-6 text-neutral-100">
      
      {/* Columna Izquierda: Buscador de Clientes */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        
        {/* Tarjeta de Resumen Global */}
        <div className="bg-gradient-to-br from-red-600 to-orange-500 border border-red-500 rounded-3xl p-5 shadow-xl shadow-red-500/20 text-white relative">
           <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">Deuda Global en la Calle</p>
           <h3 className="text-4xl font-black">${deudaGlobal.toLocaleString()}</h3>
           <button 
             onClick={generarReporteGlobalPDF}
             className="absolute right-4 bottom-4 bg-black/30 hover:bg-black/50 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
             title="Descargar PDF Global"
             disabled={loading}
           >
             <Download size={14}/> PDF Global
           </button>
         </div>

         {/* Lista Rápida de Deudores */}
         {deudoresList.length > 0 && (
           <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 shadow-xl flex flex-col max-h-48 overflow-hidden">
              <h3 className="text-sm font-bold text-neutral-400 mb-2 flex items-center justify-between">
                <span>Cuentas Pendientes</span>
                <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full">{deudoresList.length}</span>
              </h3>
              <div className="overflow-y-auto pr-2 space-y-2">
                {deudoresList.map(item => (
                  <button 
                    key={item.cliente.id} 
                    onClick={() => seleccionarCliente(item.cliente)}
                    className="w-full flex justify-between items-center text-left hover:bg-neutral-800 p-2 rounded-xl transition-colors group"
                  >
                    <span className="text-xs font-bold text-neutral-300 truncate w-3/5" title={item.cliente.nombre}>{item.cliente.nombre || 'Cliente Sin Nombre'}</span>
                    <span className="text-xs font-mono text-red-400 font-bold group-hover:text-red-300 transition-colors">${item.deuda.toLocaleString()}</span>
                  </button>
                ))}
              </div>
           </div>
         )}

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

          <button 
             onClick={() => setMostrarModalMasivo(true)}
             className="w-full mb-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-3 rounded-xl border border-neutral-700 flex items-center justify-center gap-2 transition-colors">
             <FileText size={18} className="text-blue-400" /> Carga Rápida (Pegar Texto)
          </button>

          {!selectedCliente && search && (
             <div className="bg-neutral-950 border border-neutral-800 rounded-xl max-h-60 overflow-y-auto">
                {clientes.filter(c => (c.nombre || '').toLowerCase().includes(search.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)} className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0">
                    <span className="font-bold">{c.nombre || 'Cliente Sin Nombre'}</span>
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
                <div className="flex-1 pr-4">
                   {editingClientName ? (
                     <div className="mb-2">
                       <input
                         type="text"
                         autoFocus
                         className="bg-neutral-800 text-white text-3xl font-black rounded-lg px-2 py-1 outline-none border border-blue-500 w-full max-w-md"
                         value={tempClientName}
                         onChange={e => setTempClientName(e.target.value)}
                         onBlur={guardarNombreCliente}
                         onKeyDown={e => {
                           if (e.key === 'Enter') guardarNombreCliente();
                           if (e.key === 'Escape') setEditingClientName(false);
                         }}
                       />
                     </div>
                   ) : (
                     <h2 className="text-3xl font-black text-white decoration-blue-500 underline decoration-4 underline-offset-4 mb-2 flex items-center gap-3 flex-wrap">
                       {selectedCliente.nombre || 'Cliente Sin Nombre'}
                       <button onClick={() => { setTempClientName(selectedCliente.nombre || ''); setEditingClientName(true); }} className="text-neutral-500 hover:text-blue-400 transition-colors">
                         <Edit2 size={24} />
                       </button>
                     </h2>
                   )}
                   <p className="text-neutral-400 font-mono text-sm">ID: {selectedCliente.id.split('-')[0]}...</p>
                </div>
                 <div className="bg-neutral-950 p-4 border border-neutral-800 rounded-2xl flex flex-col gap-1 min-w-[200px] shadow-2xl relative">
                    <button 
                       onClick={() => setMostrarHistorico(!mostrarHistorico)}
                       className="absolute -top-3 -right-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                       {mostrarHistorico ? 'Cerrar Histórico' : '+ Deuda Histórica'}
                    </button>
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

             {/* Formulario Deuda Histórica */}
             {mostrarHistorico && (
                <div className="bg-neutral-950 border border-blue-900/50 rounded-2xl p-4 mb-6 shadow-inner animate-fade-in">
                   <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest border-b border-neutral-800 pb-2 mb-4">Registrar Pedido Histórico</h3>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                     <div>
                       <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-1">Fecha del Pedido</label>
                       <input type="date" value={histFecha} onChange={e => setHistFecha(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none" />
                     </div>
                     <div>
                       <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-1">Proteína <span className="text-red-500">*</span></label>
                       <select value={histProteina} onChange={e => setHistProteina(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none">
                         <option value="">Selecciona...</option>
                         {menuConfig.proteinas.map(p => <option key={p} value={p}>{p}</option>)}
                       </select>
                     </div>
                     <div>
                       <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-1">Sopa</label>
                       <select value={histSopa} onChange={e => setHistSopa(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none">
                         <option value="">Ninguna / No aplica</option>
                         {menuConfig.sopas.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                     </div>
                   </div>

                   <div className="mb-4">
                     <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-2">Acompañamientos</label>
                     <div className="flex flex-wrap gap-2">
                       {menuConfig.acompanamientos.map(a => (
                         <button 
                           key={a}
                           onClick={() => setHistAcomp(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                           className={`px-3 py-1 rounded-full text-xs font-bold border ${histAcomp.includes(a) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-400'}`}>
                           {a}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                     <div>
                       <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-1">Extras (separados por coma)</label>
                       <input type="text" placeholder="Ej: Gaseosa, Postre" value={histExtrasText} onChange={e => setHistExtrasText(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none" />
                     </div>
                     <div>
                       <label className="text-[10px] text-neutral-500 font-bold uppercase block mb-1">Valor Total <span className="text-red-500">*</span></label>
                       <div className="relative">
                         <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" size={14}/>
                         <input type="number" placeholder="Ej: 15000" value={histPrecio} onChange={e => setHistPrecio(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 pl-7 text-white text-sm font-bold focus:border-blue-500 outline-none" />
                       </div>
                     </div>
                   </div>

                   <button 
                     onClick={procesarDeudaHistorica}
                     disabled={savingHistorico}
                     className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl transition-colors disabled:opacity-50">
                     {savingHistorico ? 'Guardando...' : 'Guardar Histórico'}
                   </button>
                </div>
             )}

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
                 <div className="flex flex-wrap gap-2 justify-end mt-2 md:mt-0">
                   <button onClick={generarReporteIndividualPDF} className="flex items-center gap-2 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors" title="Descargar como PDF">
                     <Download size={14}/> PDF
                   </button>
                   <button onClick={enviarWhatsApp} className="flex items-center gap-2 text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                     <MessageCircle size={14}/> WhatsApp
                   </button>
                   <button onClick={copiarReporte} className="flex items-center gap-2 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                     <Share2 size={14}/> Copiar
                   </button>
                 </div>
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

       {/* MODAL MASA_IMPORT */}
       {mostrarModalMasivo && (
         <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-950/50">
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">
                     <FileText className="text-blue-500" /> Carga Rápida de Pedidos
                  </h2>
                  <button onClick={() => setMostrarModalMasivo(false)} className="text-neutral-500 hover:text-white bg-neutral-800 rounded-full p-2"><X size={20}/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                  {stepMasivo === 'input' && (
                     <div className="animate-fade-in flex flex-col h-full gap-4">
                        <p className="text-neutral-400">Pega aquí la lista de pedidos de WhatsApp (un pedido por línea). El sistema intentará separar automáticamente los nombres, la comida y detectará si escribieron "pago".</p>
                        
                        <div>
                           <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest block mb-1">Fecha de estos pedidos</label>
                           <input type="date" value={fechaMasiva} onChange={e => setFechaMasiva(e.target.value)} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white outline-none focus:border-blue-500 block max-w-xs" />
                        </div>

                        <textarea 
                           className="w-full flex-1 min-h-[300px] bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-white resize-none outline-none focus:border-blue-500 font-mono text-sm leading-relaxed"
                           placeholder="Ejemplo:&#10;María Laura carne molida con sopa&#10;Lina posta sin arroz&#10;Andrés Aguilera sopa con arroz pago"
                           value={textoMasivo}
                           onChange={e => setTextoMasivo(e.target.value)}
                        />
                     </div>
                  )}

                  {stepMasivo === 'review' && (
                     <div className="animate-fade-in space-y-4">
                        <p className="text-neutral-400">Revisa y ajusta los detalles antes de guardarlos. Fecha: <strong className="text-white">{fechaMasiva}</strong></p>
                        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden overflow-x-auto">
                           <table className="w-full text-left text-sm whitespace-nowrap">
                              <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-500">
                                 <tr>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs w-1/4">Cliente</th>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs">Proteína</th>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs">Sopa</th>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs w-32">Precio ($)</th>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs w-24 text-center">Pagado</th>
                                    <th className="p-4 font-black tracking-widest uppercase text-xs w-20"></th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {itemsMasivos.map((item, idx) => (
                                    <tr key={item.id_temp} className="border-b border-neutral-800/50 hover:bg-neutral-900/50">
                                       <td className="p-3">
                                          {item.clienteId === 'NUEVO' ? (
                                             <div className="flex flex-col gap-1 w-full">
                                                <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full inline-block w-max mb-1">Nuevo Cliente</span>
                                                <input title={item.originalLinea} type="text" className="bg-neutral-800 text-white p-2 rounded-lg text-sm w-full outline-none focus:ring-1 focus:ring-blue-500" value={item.nuevoNombreCliente} onChange={e => {
                                                   const newItems = [...itemsMasivos];
                                                   newItems[idx].nuevoNombreCliente = e.target.value;
                                                   setItemsMasivos(newItems);
                                                }} />
                                                <select className="bg-neutral-900 text-neutral-500 p-1 text-xs border border-neutral-800 rounded cursor-pointer w-full mt-1" onChange={e => {
                                                   if (e.target.value) {
                                                      const newItems = [...itemsMasivos];
                                                      newItems[idx].clienteId = e.target.value;
                                                      setItemsMasivos(newItems);
                                                   }
                                                }}>
                                                   <option value="">¿Es un cliente existente?</option>
                                                   {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                </select>
                                             </div>
                                          ) : (
                                             <div className="flex flex-col gap-1 w-full">
                                                <select className="bg-neutral-800 text-white p-2 rounded-lg text-sm w-full outline-none focus:ring-1 focus:ring-blue-500 font-bold" value={item.clienteId} onChange={e => {
                                                   const newItems = [...itemsMasivos];
                                                   newItems[idx].clienteId = e.target.value;
                                                   setItemsMasivos(newItems);
                                                }}>
                                                   {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                   <option value="NUEVO">-- Crear Nuevo Cliente --</option>
                                                </select>
                                                <p className="text-[10px] text-neutral-500 truncate mt-1 break-all" title={item.originalLinea}>{item.originalLinea}</p>
                                             </div>
                                          )}
                                       </td>
                                       <td className="p-3">
                                          <select className="bg-neutral-800 text-white p-2 rounded-lg text-sm w-full" value={item.proteina} onChange={e => {
                                             const newItems = [...itemsMasivos];
                                             newItems[idx].proteina = e.target.value;
                                             setItemsMasivos(newItems);
                                          }}>
                                             {menuConfig.proteinas.map(p => <option key={p} value={p}>{p}</option>)}
                                          </select>
                                       </td>
                                       <td className="p-3">
                                          <select className="bg-neutral-800 text-white p-2 rounded-lg text-sm w-full" value={item.sopa} onChange={e => {
                                             const newItems = [...itemsMasivos];
                                             newItems[idx].sopa = e.target.value;
                                             setItemsMasivos(newItems);
                                          }}>
                                             <option value="">(Sin sopa)</option>
                                             {menuConfig.sopas.map(s => <option key={s} value={s}>{s}</option>)}
                                          </select>
                                       </td>
                                       <td className="p-3">
                                          <div className="flex items-center text-white bg-neutral-800 rounded-lg p-2 focus-within:ring-1 focus-within:ring-blue-500">
                                             <span className="text-neutral-500 mr-1">$</span>
                                             <input type="number" className="bg-transparent w-full outline-none font-mono" value={item.precio} onChange={e => {
                                                const newItems = [...itemsMasivos];
                                                newItems[idx].precio = e.target.value;
                                                setItemsMasivos(newItems);
                                             }} />
                                          </div>
                                       </td>
                                       <td className="p-3 text-center">
                                          <input type="checkbox" className="w-5 h-5 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer" checked={item.pagado} onChange={e => {
                                             const newItems = [...itemsMasivos];
                                             newItems[idx].pagado = e.target.checked;
                                             setItemsMasivos(newItems);
                                          }} />
                                       </td>
                                       <td className="p-3">
                                          <button onClick={() => {
                                             setItemsMasivos(itemsMasivos.filter((_, i) => i !== idx));
                                          }} className="text-red-500 hover:text-red-400 p-2"><Trash2 size={18}/></button>
                                       </td>
                                    </tr>
                                 ))}
                                 {itemsMasivos.length === 0 && (
                                    <tr>
                                       <td colSpan={6} className="text-center p-8 text-neutral-500">No hay elementos para procesar.</td>
                                    </tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  )}
               </div>
               
               <div className="p-6 border-t border-neutral-800 bg-neutral-950 flex justify-between gap-4">
                  {stepMasivo === 'review' && (
                     <button onClick={() => setStepMasivo('input')} className="px-6 py-3 rounded-xl bg-neutral-800 text-white font-bold hover:bg-neutral-700 transition">Atrás</button>
                  )}
                  {stepMasivo === 'input' && (
                     <button onClick={analizarTextoMasivo} disabled={!textoMasivo.trim()} className="w-full flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-500 transition disabled:opacity-50">
                        <Search size={18}/> Analizar y Previsualizar
                     </button>
                  )}
                  {stepMasivo === 'review' && (
                     <button onClick={guardarMasivo} disabled={savingMasivo || itemsMasivos.length === 0} className="w-full flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-500 transition disabled:opacity-50">
                        {savingMasivo ? 'Guardando Masivamente...' : <><Check size={18}/> Confirmar y Guardar Todo</>}
                     </button>
                  )}
               </div>
            </div>
         </div>
       )}
     </div>
   );
 }

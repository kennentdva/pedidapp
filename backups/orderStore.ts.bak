import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type Cliente = {
  id: string;
  nombre: string;
  es_frecuente: boolean;
  telefono?: string;
};

export type ItemPedido = {
  proteina: string | null;
  acompanamientos: string[];
  sopa: string | null;
  extras: string[];
  nota?: string;
  tipoPlato?: 'normal' | 'snack' | 'arroz';
  valor: number;
  cantidad: number;
  completado?: boolean;
};

export type PedidoDetalle = {
  proteina: string | null;
  acompanamientos: string[];
  sopa: string | null;
  extras: string[];
  nota?: string;
  tipoPlato?: 'normal' | 'snack' | 'arroz';
  // Multi-item: cuando hay más de una comida en el mismo pedido
  items?: ItemPedido[];
};

export type Pedido = {
  id?: string;
  responsable_id?: string | null;
  beneficiario?: string;
  detalle: PedidoDetalle;
  valor: number;
  estado_cocina?: 'pendiente' | 'empacado';
  estado_entrega?: 'en_espera' | 'entregado';
  pagado?: boolean;
  created_at?: string;
};

export type ArrozEspecialItem = {
  nombre: string;
  precioSmall: number;
  precioLarge: number;
};

export type MenuConfig = {
  proteinas: string[];
  acompanamientos: string[];
  sopas: string[];
  extras: { nombre: string, precio: number }[];
  snacks: { nombre: string, precio: number, desc?: string }[];
  arrozEspeciales: ArrozEspecialItem[];
  menuDia?: {
    activo: boolean;
    titulo: string;
    descripcion: string;
    precio?: number;
  };
};

interface OrderState {
  responsable: Cliente | null;
  beneficiario: string;
  detalle: PedidoDetalle;
  valorBase: number;
  precioManual: boolean;
  menuConfig: MenuConfig;
  // Carrito (multi-item por pedido)
  carrito: ItemPedido[];
  
  setResponsable: (c: Cliente | null) => void;
  setBeneficiario: (b: string) => void;
  setProteina: (p: string | null) => void;
  toggleAcompanamiento: (a: string) => void;
  setSopa: (s: string | null) => void;
  toggleExtra: (e: string, precio: number) => void;
  setValorBase: (v: number) => void;
  setSnackDirecto: (snackName: string, precio: number) => void;
  setArrozEspecial: (nombre: string, precio: number) => void;
  addItemAlCarrito: () => void;
  removeItemDelCarrito: (index: number) => void;
  fetchMenuConfig: () => Promise<void>;
  setMenuConfig: (config: Partial<MenuConfig>) => Promise<void>;
  resetOrder: () => void;
  
  editingPedidoId: string | null;
  setEditingPedidoId: (id: string | null) => void;
  saldarDeudaCompleta: (clienteId: string, monto: number) => Promise<void>;
}

const initialState = {
  responsable: null,
  beneficiario: '',
  carrito: [] as ItemPedido[],
  detalle: {
    proteina: null,
    acompanamientos: [],
    sopa: null,
    extras: []
  },
  valorBase: 0,
  precioManual: false,
  editingPedidoId: null,
};

const defaultMenuConfig: MenuConfig = {
  proteinas: ['Pechuga', 'Alitas', 'Cerdo', 'Res', 'Solo Sopa'],
  acompanamientos: ['Arroz', 'Ensalada', 'Papas', 'Patacón', 'Frijol'],
  sopas: ['Sopa del Día', 'Crema de Tomate', 'Sancocho'],
  extras: [
    { nombre: 'Helado Pequeño', precio: 2000 },
    { nombre: 'Helado Grande', precio: 3000 },
    { nombre: 'Boli', precio: 1000 },
    { nombre: 'Porción Extra', precio: 5000 },
    { nombre: 'Bebida', precio: 2500 }
  ],
  snacks: [
    { nombre: 'Boli', precio: 1000, desc: 'Cualquier sabor' },
    { nombre: 'Helado Pequeño', precio: 2000, desc: 'Vaso/Paleta 2K' },
    { nombre: 'Helado Grande', precio: 3000, desc: 'Vaso/Paleta 3K' }
  ],
  arrozEspeciales: [
    { nombre: 'Arroz Trifásico', precioSmall: 5000, precioLarge: 10000 },
    { nombre: 'Arroz Cubano', precioSmall: 5000, precioLarge: 10000 },
    { nombre: 'Arroz con Pollo', precioSmall: 5000, precioLarge: 10000 },
  ],
  menuDia: { activo: false, titulo: '', descripcion: '', precio: undefined }
};

const savedMenuConfig = localStorage.getItem('pedidapp_menu_config');
const parsedConfig = savedMenuConfig ? JSON.parse(savedMenuConfig) : null;
const initialMenuConfig = parsedConfig ? { ...defaultMenuConfig, ...parsedConfig } : defaultMenuConfig;

// Asegurar que si en el caché antiguo no existía 'extras', 'snacks' o 'arrozEspeciales', se agreguen
if (!initialMenuConfig.extras) {
  initialMenuConfig.extras = defaultMenuConfig.extras;
}
if (!initialMenuConfig.snacks) {
  initialMenuConfig.snacks = defaultMenuConfig.snacks;
}
if (!initialMenuConfig.arrozEspeciales) {
  initialMenuConfig.arrozEspeciales = defaultMenuConfig.arrozEspeciales;
}

const calcularPrecio = (proteina: string | null, sopa: string | null, acompanamientos: string[], manualPrice: boolean, currentValor: number) => {
  if (manualPrice) return currentValor; // Si el usuario editó el precio, no se recalcula automático
  if (proteina === 'Solo Sopa' || (!proteina && sopa)) {
     if (acompanamientos.includes('Arroz')) return 8000;
     return 4000;
  }
  
  // Lógica para Arroces Especiales Pequeños
  if (proteina === 'Arroz con Pollo Pequeño' || proteina === 'Arroz Cubano Pequeño') {
     return sopa ? 8000 : 5000; // 5.000 + 3.000 sopa
  }
  
  // Lógica para Arroces Especiales Medianos/Grandes
  if (proteina === 'Arroz con Pollo Mediano' || proteina === 'Arroz Cubano Mediano') {
     return sopa ? 13000 : 10000; // 10.000 + 3.000 sopa
  }

  // Precios estandar
  if (proteina && sopa) return 15000;
  if (proteina && !sopa) return 13000;
  return 0;
};

export const MENU_CONFIG_ID = '66666666-6666-6666-6666-666666666666';

export const useOrderStore = create<OrderState>((set, get) => ({
  ...initialState,
  menuConfig: initialMenuConfig,

  setResponsable: (c) => set((state) => ({ 
    responsable: c, 
    beneficiario: c ? c.nombre : state.beneficiario 
  })),
  setBeneficiario: (b) => set({ beneficiario: b }),
  
  setProteina: (p) => set((state) => {
     let sopa = state.detalle.sopa;
     if (p === 'Solo Sopa') sopa = state.menuConfig.sopas[0] || 'Sopa';
     
     return { 
       precioManual: false,
       valorBase: calcularPrecio(p, sopa, state.detalle.acompanamientos, false, 0) + state.detalle.extras.reduce((acc: number) => acc + 0, 0), // Ajustar extras si son dinámicos luego
       detalle: { ...state.detalle, proteina: p, sopa } 
     };
  }),
  
  toggleAcompanamiento: (a) => set((state) => {
    const arr = state.detalle.acompanamientos;
    const newArr = arr.includes(a) ? arr.filter(x => x !== a) : [...arr, a];
    return {
      precioManual: false,
      valorBase: calcularPrecio(state.detalle.proteina, state.detalle.sopa, newArr, false, 0),
      detalle: {
        ...state.detalle,
        acompanamientos: newArr
      }
    };
  }),
  
  setSopa: (s) => set((state) => ({ 
    precioManual: false,
    valorBase: calcularPrecio(state.detalle.proteina, s, state.detalle.acompanamientos, false, 0),
    detalle: { ...state.detalle, sopa: s } 
  })),
  
  toggleExtra: (e, precio) => set((state) => {
    const arr = state.detalle.extras;
    const isAdding = !arr.includes(e);
    return {
      precioManual: true, // asume manual temporalmente para no sobreescribir con recalculos base
      valorBase: state.valorBase + (isAdding ? precio : -precio),
      detalle: {
        ...state.detalle,
        extras: isAdding ? [...arr, e] : arr.filter(x => x !== e)
      }
    };
  }),

  setValorBase: (v) => set({ valorBase: v, precioManual: true }),
  
  setSnackDirecto: (snackName: string, precio: number) => set({
     precioManual: true,
     valorBase: precio,
     detalle: { proteina: snackName, acompanamientos: [], sopa: null, extras: [], tipoPlato: 'snack' }
  }),

  setArrozEspecial: (nombre: string, precio: number) => set({
     precioManual: true,
     valorBase: precio,
     detalle: { proteina: nombre, acompanamientos: [], sopa: null, extras: [], tipoPlato: 'arroz' }
  }),

  addItemAlCarrito: () => set((state) => {
    if (!state.detalle.proteina) return state;
    const newItem: ItemPedido = {
      proteina: state.detalle.proteina,
      acompanamientos: state.detalle.acompanamientos,
      sopa: state.detalle.sopa,
      extras: state.detalle.extras,
      nota: state.detalle.nota,
      tipoPlato: state.detalle.tipoPlato,
      valor: state.valorBase,
      cantidad: 1,
      completado: false,
    };

    // Agrupación automática: buscar si ya existe un ítem idéntico
    const existingIndex = state.carrito.findIndex(i => 
      i.proteina === newItem.proteina &&
      JSON.stringify(i.acompanamientos.sort()) === JSON.stringify(newItem.acompanamientos.sort()) &&
      i.sopa === newItem.sopa &&
      JSON.stringify(i.extras.sort()) === JSON.stringify(newItem.extras.sort()) &&
      i.nota === newItem.nota &&
      i.tipoPlato === newItem.tipoPlato
    );

    if (existingIndex !== -1) {
      const newCarrito = [...state.carrito];
      newCarrito[existingIndex] = {
        ...newCarrito[existingIndex],
        cantidad: newCarrito[existingIndex].cantidad + 1,
        valor: newCarrito[existingIndex].valor + newItem.valor
      };
      return {
        carrito: newCarrito,
        detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] },
        valorBase: 0,
        precioManual: false,
      };
    }

    return {
      carrito: [...state.carrito, newItem],
      detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] },
      valorBase: 0,
      precioManual: false,
    };
  }),

  // Función para liquidar toda la deuda de un cliente
  saldarDeudaCompleta: async (clienteId: string, monto: number) => {
    // 1. Registrar el pago
    const { error: errPago } = await supabase.from('pagos').insert([{
      cliente_id: clienteId,
      monto: monto,
      metodo: 'Efectivo'
    }]);

    if (errPago) throw errPago;

    // 2. Marcar todos los pedidos como pagados
    const { error: errPed } = await supabase.from('pedidos')
      .update({ pagado: true })
      .eq('responsable_id', clienteId)
      .eq('pagado', false);

    if (errPed) throw errPed;
  },

  removeItemDelCarrito: (index: number) => set((state) => ({
    carrito: state.carrito.filter((_, i) => i !== index),
  })),

  fetchMenuConfig: async () => {
    const { data } = await supabase.from('clientes').select('nombre').eq('id', MENU_CONFIG_ID).single();
    if (data && data.nombre) {
      try {
         const parsed = JSON.parse(data.nombre);
         if (parsed.proteinas) {
            set((state) => ({ menuConfig: { ...state.menuConfig, ...parsed } }));
         }
      } catch(e) { console.error("Error parsing remote menu", e); }
    }
  },

  setMenuConfig: async (config) => {
    const state = get();
    const newConfig = { ...state.menuConfig, ...config };
    // Optimistic local update
    set({ menuConfig: newConfig });
    localStorage.setItem('pedidapp_menu_config', JSON.stringify(newConfig));
    
    // Sincronizar hacia Supabase silenciosamente
    await supabase.from('clientes').upsert([{ 
       id: MENU_CONFIG_ID, 
       nombre: JSON.stringify(newConfig), 
       es_frecuente: false 
    }]);
  },

  setEditingPedidoId: (id) => set({ editingPedidoId: id }),

  resetOrder: () => set({
    responsable: null,
    beneficiario: '',
    carrito: [],
    detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] },
    valorBase: 0,
    precioManual: false,
    editingPedidoId: null
  })
}));

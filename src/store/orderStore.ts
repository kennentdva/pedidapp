import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type Cliente = {
  id: string;
  nombre: string;
  es_frecuente: boolean;
};

export type PedidoDetalle = {
  proteina: string | null;
  acompanamientos: string[];
  sopa: string | null;
  extras: string[];
  nota?: string;
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

export type MenuConfig = {
  proteinas: string[];
  acompanamientos: string[];
  sopas: string[];
  extras: { nombre: string, precio: number }[];
};

interface OrderState {
  responsable: Cliente | null;
  beneficiario: string;
  detalle: PedidoDetalle;
  valorBase: number;
  precioManual: boolean;
  menuConfig: MenuConfig;
  
  setResponsable: (c: Cliente | null) => void;
  setBeneficiario: (b: string) => void;
  setProteina: (p: string | null) => void;
  toggleAcompanamiento: (a: string) => void;
  setSopa: (s: string | null) => void;
  toggleExtra: (e: string, precio: number) => void;
  setValorBase: (v: number) => void;
  fetchMenuConfig: () => Promise<void>;
  setMenuConfig: (config: Partial<MenuConfig>) => Promise<void>;
  resetOrder: () => void;
}

const initialState = {
  responsable: null,
  beneficiario: '',
  detalle: {
    proteina: null,
    acompanamientos: [],
    sopa: null,
    extras: []
  },
  valorBase: 0,
  precioManual: false,
};

const defaultMenuConfig: MenuConfig = {
  proteinas: ['Pechuga', 'Alitas', 'Cerdo', 'Res', 'Solo Sopa'],
  acompanamientos: ['Arroz', 'Ensalada', 'Papas', 'Patacón', 'Frijol'],
  sopas: ['Sopa del Día', 'Crema de Tomate', 'Sancocho'],
  extras: [
    { nombre: 'Helado', precio: 3000 },
    { nombre: 'Porción Extra', precio: 5000 },
    { nombre: 'Bebida', precio: 2500 }
  ]
};

const savedMenuConfig = localStorage.getItem('pedidapp_menu_config');
const parsedConfig = savedMenuConfig ? JSON.parse(savedMenuConfig) : null;
const initialMenuConfig = parsedConfig ? { ...defaultMenuConfig, ...parsedConfig } : defaultMenuConfig;

// Asegurar que si en el caché antiguo no existía 'extras', se agregue el por defecto
if (!initialMenuConfig.extras) {
  initialMenuConfig.extras = defaultMenuConfig.extras;
}

const calcularPrecio = (proteina: string | null, sopa: string | null, acompanamientos: string[], manualPrice: boolean, currentValor: number) => {
  if (manualPrice) return currentValor; // Si el usuario editó el precio, no se recalcula automático
  if (proteina === 'Solo Sopa' || (!proteina && sopa)) {
     if (acompanamientos.includes('Arroz')) return 8000;
     return 4000;
  }
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

  resetOrder: () => set({
    responsable: null,
    beneficiario: '',
    detalle: { proteina: null, acompanamientos: [], sopa: null, extras: [] },
    valorBase: 0,
    precioManual: false,
  })
}));

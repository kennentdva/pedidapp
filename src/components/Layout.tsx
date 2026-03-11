import { Outlet, NavLink } from 'react-router-dom';
import { Utensils, ChefHat, Truck, Wallet, Book, Activity, Users } from 'lucide-react';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-100 md:flex-row font-sans selection:bg-orange-500/30">
      {/* Sidebar/Bottom Nav */}
      <nav className="fixed bottom-0 w-full bg-neutral-950 border-t border-neutral-800 md:relative md:w-64 md:border-r md:border-t-0 p-3 md:p-4 z-50">
        <div className="hidden md:flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Utensils size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            PedidApp
          </h1>
        </div>

        <ul className="flex justify-around md:flex-col md:gap-2">
          <li>
            <NavLink to="/" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-orange-500/10 text-orange-400 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Utensils size={24} /> <span className="hidden md:block">Ventas</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/cocina" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-yellow-500/10 text-yellow-500 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <ChefHat size={24} /> <span className="hidden md:block">Cocina</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/despacho" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-emerald-500/10 text-emerald-500 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Truck size={24} /> <span className="hidden md:block">Despacho</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/cuentas" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Wallet size={24} /> <span className="hidden md:block">Cuentas</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/diario" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-orange-500/10 text-orange-500 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Book size={24} /> <span className="hidden md:block">Diario</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/estadisticas" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Activity size={24} /> <span className="hidden md:block">Estadísticas</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/directorio" className={({isActive}) => `flex items-center justify-center md:justify-start gap-3 p-3 rounded-xl md:rounded-lg transition-all active:scale-95 min-w-[44px] min-h-[44px] ${isActive ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'}`}>
              <Users size={24} /> <span className="hidden md:block">Directorio</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <main className="flex-1 overflow-y-auto w-full mb-16 md:mb-0 bg-[#0f0f13]">
        <div className="max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

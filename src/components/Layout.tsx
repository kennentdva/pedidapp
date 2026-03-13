import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Utensils, ChefHat, Truck, Wallet, Book,
  Activity, Users, Eye, Sun, Moon, ArrowLeft
} from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';

const navItems = [
  { to: '/',             icon: Utensils,  label: 'Ventas',       activeColor: 'text-orange-400  bg-orange-500/10 border-orange-500/30' },
  { to: '/cocina',       icon: ChefHat,   label: 'Cocina',       activeColor: 'text-yellow-400  bg-yellow-500/10 border-yellow-500/30' },
  { to: '/despacho',     icon: Truck,     label: 'Despacho',     activeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { to: '/cuentas',      icon: Wallet,    label: 'Cuentas',      activeColor: 'text-blue-400    bg-blue-500/10  border-blue-500/30'  },
  { to: '/diario',       icon: Book,      label: 'Diario',       activeColor: 'text-orange-400  bg-orange-500/10 border-orange-500/30' },
  { to: '/estadisticas', icon: Activity,  label: 'Stats',        activeColor: 'text-indigo-400  bg-indigo-500/10 border-indigo-500/30' },
  { to: '/directorio',   icon: Users,     label: 'Directorio',   activeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
];

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-100 md:flex-row font-sans selection:bg-orange-500/30">

      {/* ── SIDEBAR (desktop) ── */}
      <nav className="hidden md:flex md:flex-col md:w-60 md:h-full md:bg-neutral-950 md:border-r md:border-neutral-800 p-4 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Utensils size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            PedidApp
          </h1>
        </div>

        {/* Nav items */}
        <ul className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label, activeColor }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-sm font-semibold ${
                    isActive
                      ? `${activeColor} border-opacity-50`
                      : 'text-neutral-400 border-transparent hover:bg-neutral-800/50 hover:text-neutral-200'
                  }`
                }
              >
                <Icon size={20} /> {label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink
              to="/estado"
              target="_blank"
              rel="noopener noreferrer"
              className={() => 'flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent text-neutral-400 hover:bg-neutral-800/50 hover:text-cyan-400 text-sm font-semibold transition-all'}
              title="Vista pública de pedidos"
            >
              <Eye size={20} /> Vista Pública
            </NavLink>
          </li>
        </ul>

        {/* Theme toggle desktop */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all text-sm font-semibold mt-2"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
        </button>
      </nav>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-neutral-950 border-t border-neutral-800 safe-area-inset-bottom">
        {/* Scrollable row of nav items */}
        <div className="flex overflow-x-auto no-scrollbar">
          {navItems.map(({ to, icon: Icon, label, activeColor }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[58px] transition-all ${
                  isActive ? activeColor.split(' ')[0] : 'text-neutral-500'
                }`
              }
            >
              <Icon size={22} />
              <span className="text-[10px] font-bold tracking-tight leading-none">{label}</span>
            </NavLink>
          ))}

          {/* Vista pública */}
          <NavLink
            to="/estado"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[58px] text-neutral-500"
          >
            <Eye size={22} />
            <span className="text-[10px] font-bold tracking-tight leading-none">Vista</span>
          </NavLink>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[58px] text-neutral-500 active:scale-90 transition-transform"
          >
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            <span className="text-[10px] font-bold tracking-tight leading-none">
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </span>
          </button>
        </div>
      </nav>

      {/* ── MOBILE HEADER (brand + back) ── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-neutral-950 border-b border-neutral-800 sticky top-0 z-40">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all active:scale-90"
          aria-label="Volver"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Utensils size={13} className="text-white" />
          </div>
          <span className="font-black text-base text-white">PedidApp</span>
        </div>
        <div className="w-10" /> {/* spacer */}
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-y-auto w-full pb-16 md:pb-0 bg-[#0f0f13]">
        <div className="max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

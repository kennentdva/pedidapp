import { useState } from 'react';
import { ChefHat, Lock, KeyRound } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'Eltirano123') {
      localStorage.setItem('pedidapp_auth', 'true');
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col justify-center items-center p-4 text-white">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mb-4 border border-orange-500/30">
            <ChefHat size={40} className="text-orange-500" />
          </div>
          <h1 className="text-3xl font-black text-white">PedidApp</h1>
          <p className="text-neutral-500 mt-2 font-medium">Panel de Administración</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-2">
               <Lock size={14}/> Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(false); }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors text-white"
              placeholder="admin"
              required
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-2">
               <KeyRound size={14}/> Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors text-white"
              placeholder="••••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl text-sm font-bold text-center animate-pulse">
              Credenciales incorrectas.
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 mt-4 rounded-xl text-lg font-black text-white transition-all active:scale-95 bg-gradient-to-r from-orange-500 to-red-600 shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
          >
            Ingresar al Sistema
          </button>
        </form>
      </div>
      
      <p className="mt-8 text-xs text-neutral-600 font-medium">Protegido con encriptación local.</p>
    </div>
  );
}

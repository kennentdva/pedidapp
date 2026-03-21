import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Ventas from './pages/Ventas';
import Cocina from './pages/Cocina';
import Despacho from './pages/Despacho';
import Cuentas from './pages/Cuentas';
import Diario from './pages/Diario';
import Estadisticas from './pages/Estadisticas';
import Directorio from './pages/Directorio';
import Estado from './pages/Estado';
import Login from './pages/Login';
import { useOrderStore } from './store/orderStore';
import { ThemeProvider } from './lib/ThemeContext';
import { Download } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    // Si ya hay sesión guardada de antes
    const authStatus = localStorage.getItem('pedidapp_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      useOrderStore.getState().fetchMenuConfig();
    }
    setLoading(false);

    // Lógica de Instalación PWA
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Mostrar botón si es Android o móvil
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        setShowInstallBtn(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('PWA instalada con éxito');
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  if (loading) return null; // Evitar pantallazos

  if (!isAuthenticated) {
    return <Login onLogin={() => {
       setIsAuthenticated(true);
       useOrderStore.getState().fetchMenuConfig();
    }} />;
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública — sin login ni Layout */}
          <Route path="/estado" element={<Estado />} />
          {/* Rutas protegidas */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Ventas />} />
            <Route path="cocina" element={<Cocina />} />
            <Route path="despacho" element={<Despacho />} />
            <Route path="cuentas" element={<Cuentas />} />
            <Route path="diario" element={<Diario />} />
            <Route path="estadisticas" element={<Estadisticas />} />
            <Route path="directorio" element={<Directorio />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      
      {/* Botón flotante de Instalación PWA (Solo Android/Móvil si no está instalada) */}
      {showInstallBtn && (
        <button
          onClick={handleInstallClick}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-full shadow-2xl flex items-center gap-2 animate-bounce border-2 border-indigo-400"
        >
          <Download size={20} />
          Instalar Aplicación
        </button>
      )}
    </ThemeProvider>
  );
}

export default App;

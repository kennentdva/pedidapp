import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Ventas from './pages/Ventas';
import Cocina from './pages/Cocina';
import Despacho from './pages/Despacho';
import Cuentas from './pages/Cuentas';
import Diario from './pages/Diario';
import Estadisticas from './pages/Estadisticas';
import Login from './pages/Login';
import { useOrderStore } from './store/orderStore';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si ya hay sesión guardada de antes
    const authStatus = localStorage.getItem('pedidapp_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      useOrderStore.getState().fetchMenuConfig();
    }
    setLoading(false);
  }, []);

  if (loading) return null; // Evitar pantallazos

  if (!isAuthenticated) {
    return <Login onLogin={() => {
       setIsAuthenticated(true);
       useOrderStore.getState().fetchMenuConfig();
    }} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Ventas />} />
          <Route path="cocina" element={<Cocina />} />
          <Route path="despacho" element={<Despacho />} />
          <Route path="cuentas" element={<Cuentas />} />
          <Route path="diario" element={<Diario />} />
          <Route path="estadisticas" element={<Estadisticas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

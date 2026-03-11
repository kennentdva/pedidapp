import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Search, Edit2, Save, X, Phone, MessageCircle } from 'lucide-react';
import { type Cliente, MENU_CONFIG_ID } from '../store/orderStore';

export default function Directorio() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    setLoading(true);
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    if (data) setClientes((data as Cliente[]).filter(c => c.id !== MENU_CONFIG_ID));
    setLoading(false);
  };

  const startEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setEditNombre(cliente.nombre);
    setEditTelefono(cliente.telefono || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNombre('');
    setEditTelefono('');
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from('clientes')
      .update({ nombre: editNombre, telefono: editTelefono })
      .eq('id', id);

    if (!error) {
      setClientes(clientes.map(c => c.id === id ? { ...c, nombre: editNombre, telefono: editTelefono } : c));
      cancelEdit();
    } else {
      alert('Error al guardar el contacto. Asegúrate de haber agregado la columna "telefono" en Supabase.');
    }
  };

  const enviarWhatsApp = (telefono: string, nombre: string) => {
    if (!telefono) return alert('Este contacto no tiene número registrado.');
    const texto = `Hola ${nombre}, `;
    // Limpiar el número de celular dejándole solo números.
    const numeroLimpio = telefono.replace(/\D/g, '');
    let url = '';
    // Si tiene 10 dígitos asume que es el formato de Colombia o similar, le agregamos el +57
    if (numeroLimpio.length === 10) {
       url = `https://wa.me/57${numeroLimpio}?text=${encodeURIComponent(texto)}`;
    } else {
       url = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(texto)}`;
    }
    window.open(url, '_blank');
  };

  const filteredClientes = clientes.filter(c => 
    (c.nombre || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.telefono || '').includes(search)
  );

  return (
    <div className="flex flex-col h-full p-2 md:p-6 text-neutral-100">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 md:p-8 shadow-xl flex-1 flex flex-col">
        <h2 className="text-3xl font-black text-white flex items-center gap-3 mb-6 decoration-emerald-500 underline decoration-4 underline-offset-4">
          <Users className="text-emerald-500" size={32} /> Directorio de Clientes / Docentes
        </h2>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o número de celular..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-emerald-500 transition-colors text-lg"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-sm uppercase tracking-wider">
                  <th className="py-4 px-4 font-bold">Nombre del Cliente</th>
                  <th className="py-4 px-4 font-bold">Celular / WhatsApp</th>
                  <th className="py-4 px-4 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map(cliente => (
                  <tr key={cliente.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors group">
                    <td className="py-4 px-4">
                      {editingId === cliente.id ? (
                        <input
                          type="text"
                          className="bg-neutral-950 border border-emerald-500 rounded-lg px-3 py-2 outline-none w-full"
                          value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                        />
                      ) : (
                        <span className="font-bold text-lg">{cliente.nombre}</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {editingId === cliente.id ? (
                        <div className="flex items-center gap-2">
                          <Phone size={16} className="text-neutral-500"/>
                          <input
                            type="text"
                            placeholder="Ej: 3001234567"
                            className="bg-neutral-950 border border-emerald-500 rounded-lg px-3 py-2 outline-none w-full max-w-[200px]"
                            value={editTelefono}
                            onChange={e => setEditTelefono(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {cliente.telefono ? (
                            <span className="font-mono text-neutral-300 bg-neutral-800 px-3 py-1 rounded-lg border border-neutral-700">{cliente.telefono}</span>
                          ) : (
                            <span className="text-neutral-600 italic text-sm">Sin registrar</span>
                          )}
                          {cliente.telefono && (
                            <button
                              onClick={() => enviarWhatsApp(cliente.telefono!, cliente.nombre)}
                              className="bg-green-600/20 text-green-500 hover:bg-green-600 hover:text-white p-2 rounded-full transition-colors tooltip"
                              title="Enviar WhatsApp"
                            >
                              <MessageCircle size={18} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {editingId === cliente.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(cliente.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg transition-colors title='Guardar'">
                            <Save size={18} />
                          </button>
                          <button onClick={cancelEdit} className="bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded-lg transition-colors title='Cancelar'">
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(cliente)} className="text-neutral-500 hover:text-emerald-400 p-2 transition-colors opacity-0 group-hover:opacity-100 title='Editar'">
                          <Edit2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredClientes.length === 0 && !loading && (
                   <tr>
                     <td colSpan={3} className="py-8 text-center text-neutral-500">
                       No se encontraron clientes con esa búsqueda.
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Inicialización de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Appointment {
  id: number;
  whatsapp: string;
  appointment_date: string | null;
  status: string;
  business_name: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS PARA LA CONTRASEÑA ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // CONTRASEÑA PARA ENTRAR (Cámbiala si deseas)
    if (password === "iron2026") {
      setIsAuthenticated(true);
      fetchAppointments();
    } else {
      setErrorMsg("Contraseña incorrecta. Intenta de nuevo.");
    }
  };

  async function fetchAppointments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error("Error cargando citas:", error);
    } finally {
      setLoading(false);
    }
  }

  // --- PANTALLA DE LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Acceso VIP</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña de Administrador</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {errorMsg && <p className="text-red-500 text-sm font-medium">{errorMsg}</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Ingresar al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- PANTALLA DEL DASHBOARD (Solo visible si está autenticado) ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 text-black">
      <div className="max-w-6xl mx-auto">
        {/* Encabezado */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Panel de Control</h1>
            <p className="text-gray-500">Gestión de Citas y Leads - Iron Life Gym</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={fetchAppointments}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Actualizar Lista
            </button>
            <button 
              onClick={() => setIsAuthenticated(false)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Tabla de Datos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Fecha Registro</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">WhatsApp</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Fecha Cita</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">Cargando datos...</td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400">Aún no hay registros.</td>
                  </tr>
                ) : (
                  appointments.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(app.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {app.whatsapp}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {app.appointment_date ? (
                          <span className="text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded border border-blue-100">
                            {app.appointment_date}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Sin fecha</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                          app.status === 'cita_confirmada' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {app.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <a 
                          href={`https://wa.me/591${app.whatsapp.replace('+', '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700 text-sm font-bold flex items-center gap-1"
                        >
                          Contactar
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MapPage from './MapPage';               // ← nuevo: el mapa ahora vive en su propio componente
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div>
      {/* Barra superior: solo se muestra si hay usuario logueado */}
      {user && (
        <nav style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '8px 16px',
          background: '#f1f5f9',
          borderBottom: '1px solid #cbd5e1'
        }}>
          <span style={{ marginRight: 16, fontSize: 14 }}>
            {user.email}
          </span>
          <button
            onClick={logout}
            style={{
              padding: '4px 12px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Cerrar sesión
          </button>
        </nav>
      )}

      {/* Definición de rutas */}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        {/* Cualquier otra URL redirige al inicio */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
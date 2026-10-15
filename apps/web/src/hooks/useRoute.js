import { useState } from 'react';

export function useRoute() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateRoute = async (fromLat, fromLon, toLat, toLon) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = `http://localhost:8080/api/route?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const path = data.paths?.[0]?.points;
      if (!path) throw new Error('No se encontró ruta');
      return path;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { calculateRoute, loading, error };
}
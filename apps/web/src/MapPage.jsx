import { useRef, useState, useCallback, useEffect } from 'react';
import { useMap } from './hooks/useMap';
import { useRoute } from './hooks/useRoute';
import { getParkingSpot, saveParkingSpot } from './api/parking';

export default function MapPage() {
  const containerRef = useRef(null);
  const [activeField, setActiveField] = useState('origin');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [parkingSpot, setParkingSpot] = useState(null);
  const [pendingParkingSpot, setPendingParkingSpot] = useState(null);
  const [parkingError, setParkingError] = useState('');
  const [savingParkingSpot, setSavingParkingSpot] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getParkingSpot()
      .then(spot => {
        if (!cancelled && spot) {
          setParkingSpot({ lng: spot.longitude, lat: spot.latitude });
        }
      })
      .catch(err => {
        if (!cancelled) setParkingError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handler de clic en el mapa: asigna al campo activo
  const handleMapClick = useCallback((lng, lat) => {
    if (activeField === 'origin') {
      setOrigin({ lng, lat });
    } else if (activeField === 'destination') {
      setDestination({ lng, lat });
    } else if (activeField === 'parking') {
      setParkingError('');
      setPendingParkingSpot({ lng, lat });
    }
  }, [activeField]);

  const { addMarker, clearMarkers, drawRoute, clearRoute } = useMap(containerRef, handleMapClick);
  const { calculateRoute, loading, error } = useRoute();

  // Mantener los marcadores sincronizados con origen/destino
  useEffect(() => {
    clearMarkers();
    if (origin) addMarker(origin.lng, origin.lat, '#22c55e'); // verde
    if (destination) addMarker(destination.lng, destination.lat, '#ef4444'); // rojo
    if (parkingSpot) addMarker(parkingSpot.lng, parkingSpot.lat, '#7c3aed');
    if (pendingParkingSpot) addMarker(pendingParkingSpot.lng, pendingParkingSpot.lat, '#f59e0b');
  }, [origin, destination, parkingSpot, pendingParkingSpot, addMarker, clearMarkers]);

  const handleSaveParkingSpot = async () => {
    if (!pendingParkingSpot || savingParkingSpot) return;
    setSavingParkingSpot(true);
    setParkingError('');
    try {
      await saveParkingSpot(pendingParkingSpot.lat, pendingParkingSpot.lng);
      setParkingSpot(pendingParkingSpot);
      setPendingParkingSpot(null);
      setActiveField('origin');
    } catch (err) {
      setParkingError(err.message);
    } finally {
      setSavingParkingSpot(false);
    }
  };

  // Calcular ruta al presionar el botón
  const handleCalculate = async () => {
    if (!origin || !destination) return;
    const geoJson = await calculateRoute(
      origin.lat, origin.lng,
      destination.lat, destination.lng
    );
    if (geoJson) {
      setRouteGeoJson(geoJson);
      drawRoute(geoJson);
    }
  };

  // Limpiar todo
  const handleClear = () => {
    setOrigin(null);
    setDestination(null);
    setRouteGeoJson(null);
    clearMarkers();
    clearRoute();
  };

  // Estilos (pueden moverse a CSS después)
  const panelStyle = {
    position: 'absolute', top: 20, left: 20, zIndex: 10,
    background: 'white', padding: '16px', borderRadius: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', display: 'flex',
    flexDirection: 'column', gap: '10px', minWidth: '260px'
  };
  const fieldRow = { display: 'flex', alignItems: 'center', gap: '8px' };
  const labelBase = { fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', width: '70px' };
  const inputBase = {
    flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1',
    background: '#f8fafc', fontSize: '13px', cursor: 'pointer'
  };
  const activeInput = { ...inputBase, borderColor: '#3b82f6', boxShadow: '0 0 0 1px #3b82f6' };
  const activeLabel = { ...labelBase, color: '#3b82f6' };
  const parkingButtonStyle = {
    padding: '8px 12px',
    backgroundColor: activeField === 'parking' ? '#7c3aed' : '#f1f5f9',
    color: activeField === 'parking' ? 'white' : '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    cursor: savingParkingSpot ? 'wait' : 'pointer'
  };
  const parkingStatus = savingParkingSpot
    ? 'Guardando estacionamiento...'
    : activeField === 'parking'
      ? pendingParkingSpot
        ? 'Ubicación seleccionada. Confirmá para guardarla.'
        : 'Hacé clic en el mapa para elegir una ubicación.'
      : parkingSpot
        ? 'Estacionamiento guardado'
        : '';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <div style={panelStyle}>
        <div style={fieldRow}>
          <span
            style={activeField === 'origin' ? activeLabel : labelBase}
            onClick={() => setActiveField('origin')}
          >
            Partida
          </span>
          <input
            type="text"
            readOnly
            value={origin ? `${origin.lat.toFixed(6)}, ${origin.lng.toFixed(6)}` : 'Sin seleccionar'}
            style={activeField === 'origin' ? activeInput : inputBase}
            onClick={() => setActiveField('origin')}
          />
        </div>

        <div style={fieldRow}>
          <span
            style={activeField === 'destination' ? activeLabel : labelBase}
            onClick={() => setActiveField('destination')}
          >
            Destino
          </span>
          <input
            type="text"
            readOnly
            value={destination ? `${destination.lat.toFixed(6)}, ${destination.lng.toFixed(6)}` : 'Sin seleccionar'}
            style={activeField === 'destination' ? activeInput : inputBase}
            onClick={() => setActiveField('destination')}
          />
        </div>

        <div style={fieldRow}>
          <span style={labelBase}>
            Estac.
          </span>
          <input
            type="text"
            readOnly
            value={pendingParkingSpot
              ? `${pendingParkingSpot.lat.toFixed(6)}, ${pendingParkingSpot.lng.toFixed(6)} (sin guardar)`
              : parkingSpot
                ? `${parkingSpot.lat.toFixed(6)}, ${parkingSpot.lng.toFixed(6)}`
                : 'Sin marcar'}
            style={inputBase}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeField === 'parking') {
              setActiveField('origin');
              setPendingParkingSpot(null);
            } else {
              setActiveField('parking');
              setPendingParkingSpot(null);
            }
          }}
          disabled={savingParkingSpot}
          style={parkingButtonStyle}
        >
          {activeField === 'parking' ? 'Cancelar selección' : 'Elegir ubicación'}
        </button>
        {activeField === 'parking' && (
          <button
            type="button"
            onClick={handleSaveParkingSpot}
            disabled={!pendingParkingSpot || savingParkingSpot}
            style={{
              padding: '10px 16px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: !pendingParkingSpot || savingParkingSpot ? 'not-allowed' : 'pointer',
              opacity: !pendingParkingSpot || savingParkingSpot ? 0.5 : 1
            }}
          >
            {savingParkingSpot ? 'Guardando...' : 'Agregar estacionamiento'}
          </button>
        )}
        {parkingStatus && <p style={{ margin: 0 }}>{parkingStatus}</p>}
        {parkingError && <p style={{ color: 'red', margin: 0 }}>{parkingError}</p>}

        <button
          onClick={handleCalculate}
          disabled={!origin || !destination || loading}
          style={{
            padding: '10px 16px', backgroundColor: '#2563eb', color: 'white',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
            opacity: (!origin || !destination) ? 0.5 : 1
          }}
        >
          {loading ? 'Calculando...' : 'Calcular ruta'}
        </button>

        <button
          onClick={handleClear}
          style={{
            padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155',
            border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer'
          }}
        >
          Limpiar
        </button>

        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
import { useRef, useEffect } from 'react';
import { useMap } from '../hooks/useMap';

export default function MapView({ onMapClick, routeGeoJson }) {
  const containerRef = useRef(null);
  const { addMarker, clearMarkers, drawRoute } = useMap(containerRef, onMapClick);

  // Cuando cambia la ruta, dibujarla
  useEffect(() => {
    if (routeGeoJson) {
      drawRoute(routeGeoJson);
    }
  }, [routeGeoJson, drawRoute]);

  // Exponemos addMarker y clearMarkers para que el padre los use
  // (alternativa: usar useImperativeHandle, pero por ahora props)
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}

// Necesitamos exponer addMarker y clearMarkers desde App.
// Vamos a modificar la estrategia: mejor que App maneje los marcadores
// llamando a métodos del hook. Para eso, hacemos que useMap devuelva las funciones
// y MapView las reciba por props o usamos useImperativeHandle.
//
// Alternativa más simple: App usa directamente useMap y pasa el containerRef.
// Pero App no tiene el containerRef... 
// 
// Solución definitiva: MapView acepta props `markers` (array de {lng, lat, color})
// y se encarga de dibujarlos internamente.
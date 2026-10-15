import { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function useMap(containerRef, onClick) {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const onClickRef = useRef(onClick); // guardamos la última versión de onClick sin reinicializar el mapa

  // Mantenemos actualizada la ref
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (mapRef.current) return;

    console.log('Inicializando mapa...');
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm-raster',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [-64.5, -35.0],
      zoom: 5
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Un solo listener de clic para toda la vida del mapa
    mapRef.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      console.log('Mapa clickeado en:', lng, lat);
      if (onClickRef.current) {
        onClickRef.current(lng, lat);
      }
    });

    console.log('Mapa inicializado y listener de clic agregado');
  }, [containerRef]); // <- sin dependencia onClick, se ejecuta una sola vez

  const addMarker = useCallback((lng, lat, color = '#2563eb') => {
    if (!mapRef.current) return;
    const marker = new maplibregl.Marker({ color })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
    markersRef.current.push(marker);
    return marker;
  }, []);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
  }, []);

  const drawRoute = useCallback((geoJson) => {
    if (!mapRef.current) return;
    if (mapRef.current.getLayer('route')) mapRef.current.removeLayer('route');
    if (mapRef.current.getSource('route')) mapRef.current.removeSource('route');

    mapRef.current.addSource('route', {
      type: 'geojson',
      data: geoJson
    });

    mapRef.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': '#2563eb',
        'line-width': 4
      }
    });

    const coords = geoJson.coordinates;
    if (coords?.length) {
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach(c => bounds.extend(c));
      mapRef.current.fitBounds(bounds, { padding: 50 });
    }
  }, []);

  const clearRoute = useCallback(() => {
    if (!mapRef.current) return;
    if (mapRef.current.getLayer('route')) mapRef.current.removeLayer('route');
    if (mapRef.current.getSource('route')) mapRef.current.removeSource('route');
  }, []);

  return { mapRef, addMarker, clearMarkers, drawRoute, clearRoute };
}
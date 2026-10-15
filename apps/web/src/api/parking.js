import { apiFetch } from './client';

const PARKING_URL = 'http://localhost:8080/api/parking';

export async function getParkingSpot() {
  const response = await apiFetch(PARKING_URL);
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`No se pudo cargar el estacionamiento (HTTP ${response.status})`);
  }
  return response.json();
}

export async function saveParkingSpot(latitude, longitude) {
  const response = await apiFetch(PARKING_URL, {
    method: 'PUT',
    body: JSON.stringify({ latitude, longitude })
  });
  if (!response.ok) {
    throw new Error(`No se pudo guardar el estacionamiento (HTTP ${response.status})`);
  }
  return response.json();
}

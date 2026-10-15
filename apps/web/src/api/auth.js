const BASE_URL = 'http://localhost:8080/api/auth';

export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Error ${res.status}: ${errorBody}`);
  }
  return res.json();
}

export async function register(email, password, fullName) {
  const res = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName })
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Error ${res.status}: ${errorBody}`);
  }
  return res.json();
}
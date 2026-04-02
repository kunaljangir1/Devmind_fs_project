const API_URL = 'http://localhost:3001/api';

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  let token = '';
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('token') || '';
  }

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error: ${response.status}`);
  }

  return response.json();
};

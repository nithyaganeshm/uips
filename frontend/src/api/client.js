import axios from 'axios';
import { API_BASE } from '../config';

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
};

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
client.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`, config.data || '');
    }
    return config;
  },
  (error) => Promise.reject(error)
);


// Response interceptor
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear session strictly on 401
      sessionStorage.removeItem('uips_user');
      if (!window.location.pathname.startsWith('/login')) {
         window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;

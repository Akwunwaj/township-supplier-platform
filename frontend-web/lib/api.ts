
import axios from 'axios';

export function getToken(){
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tsm_access');
}

export function setToken(token: string){
  if (typeof window === 'undefined') return;
  localStorage.setItem('tsm_access', token);
}

export function clearToken(){
  if (typeof window === 'undefined') return;
  localStorage.removeItem('tsm_access');
}

export const api = axios.create({ baseURL: '' });
api.interceptors.request.use((config)=>{
  const t = getToken();
  if (t) config.headers = { ...(config.headers||{}), Authorization: `Bearer ${t}` };
  return config;
});

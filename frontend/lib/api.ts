import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { APISuccess, APIFailure } from '@/types/api.types';

// All browser API calls go to the Next.js proxy (/api/...) — never directly to backend
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token from session to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const session = await getSession();
  if (session?.accessToken) {
    config.headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  return config;
});

// On 401, try refresh then retry once; on second 401, sign out
let isRefreshing = false;

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true;
      isRefreshing = true;
      try {
        const session = await getSession();
        if (session?.refreshToken) {
          const { data } = await axios.post('/api/auth/refresh', {
            refreshToken: session.refreshToken,
          });
          original.headers['Authorization'] = `Bearer ${data.data.accessToken}`;
          isRefreshing = false;
          return api(original);
        }
      } catch {
        isRefreshing = false;
        await signOut({ callbackUrl: '/login' });
      }
    }
    return Promise.reject(error);
  },
);

// Typed helpers that unwrap APISuccess/APIFailure
export const apiGet = async <T>(url: string): Promise<APISuccess<T>> => {
  const { data } = await api.get<APISuccess<T>>(url);
  return data;
};

export const apiPost = async <T>(url: string, body?: unknown): Promise<APISuccess<T>> => {
  const { data } = await api.post<APISuccess<T>>(url, body);
  return data;
};

export const apiPatch = async <T>(url: string, body?: unknown): Promise<APISuccess<T>> => {
  const { data } = await api.patch<APISuccess<T>>(url, body);
  return data;
};

export const apiPut = async <T>(url: string, body?: unknown): Promise<APISuccess<T>> => {
  const { data } = await api.put<APISuccess<T>>(url, body);
  return data;
};

export const apiDelete = async <T>(url: string): Promise<APISuccess<T>> => {
  const { data } = await api.delete<APISuccess<T>>(url);
  return data;
};

export type { APISuccess, APIFailure };

export default api;

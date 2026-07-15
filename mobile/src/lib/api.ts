import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { config } from "./config";
import { storage, StorageKeys } from "./storage";

export const api = axios.create({
  baseURL: config.apiUrl,
  timeout: 15000,
});

// Attach the access token to every request.
api.interceptors.request.use(async (req: InternalAxiosRequestConfig) => {
  const token = await storage.get(StorageKeys.accessToken);
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await storage.get(StorageKeys.refreshToken);
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${config.apiUrl}/auth/refresh`, { refreshToken });
    await storage.set(StorageKeys.accessToken, data.accessToken);
    return data.accessToken as string;
  } catch {
    await storage.remove(StorageKeys.accessToken);
    await storage.remove(StorageKeys.refreshToken);
    return null;
  }
}

// On 401, try a single token refresh then replay the request.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

// Normalise API errors into a readable message.
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string })?.error ?? err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

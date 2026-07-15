import { create } from "zustand";
import { api } from "../lib/api";
import { storage, StorageKeys } from "../lib/storage";

export type Role = "RESIDENT" | "GUARD" | "ADMIN";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  avatarUrl?: string | null;
  societyId?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

async function persistTokens(accessToken: string, refreshToken?: string) {
  await storage.set(StorageKeys.accessToken, accessToken);
  if (refreshToken) await storage.set(StorageKeys.refreshToken, refreshToken);
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  // Restore session on app launch using the stored access token.
  bootstrap: async () => {
    const token = await storage.get(StorageKeys.accessToken);
    if (!token) return set({ status: "unauthenticated", user: null });
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data.user, status: "authenticated" });
    } catch {
      set({ status: "unauthenticated", user: null });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    await persistTokens(data.accessToken, data.refreshToken);
    set({ user: data.user, status: "authenticated" });
    return data.user as AuthUser;
  },

  logout: async () => {
    await storage.remove(StorageKeys.accessToken);
    await storage.remove(StorageKeys.refreshToken);
    set({ user: null, status: "unauthenticated" });
  },

  setUser: (user) => set({ user }),
}));

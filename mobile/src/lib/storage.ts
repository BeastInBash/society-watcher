import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// SecureStore is native-only; fall back to localStorage on web so dev works there.
const web = Platform.OS === "web";

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) return void globalThis.localStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) return void globalThis.localStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export const StorageKeys = {
  accessToken: "portl.accessToken",
  refreshToken: "portl.refreshToken",
} as const;

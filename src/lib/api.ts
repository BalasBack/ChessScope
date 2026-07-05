import { isTauri } from "@tauri-apps/api/core";
import { tauriApi } from "./tauri-api";
import { webApi } from "./web/api";
import type { ChessScopeApi } from "./types";

export const api: ChessScopeApi = isTauri() ? tauriApi : webApi;

export function isWebApp(): boolean {
  return !isTauri();
}

export * from "./types";

import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AnalysisProgress } from "./types";

export function subscribeAnalysisProgress(
  onProgress: (payload: AnalysisProgress) => void,
): () => void {
  if (isTauri()) {
    let dispose: (() => void) | undefined;
    listen<AnalysisProgress>("analysis-progress", (event) => {
      onProgress(event.payload);
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }

  const handler = (event: Event) => {
    onProgress((event as CustomEvent<AnalysisProgress>).detail);
  };
  window.addEventListener("analysis-progress", handler);
  return () => window.removeEventListener("analysis-progress", handler);
}

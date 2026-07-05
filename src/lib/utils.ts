import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function winRate(wins: number, games: number): string {
  if (games === 0) return "—";
  return `${Math.round((wins / games) * 100)}%`;
}

export function formatResult(result: string): string {
  switch (result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "draw":
      return "Draw";
    default:
      return result;
  }
}

export function resultColor(result: string): string {
  switch (result) {
    case "win":
      return "text-emerald-400";
    case "loss":
      return "text-red-400";
    case "draw":
      return "text-amber-400";
    default:
      return "text-[var(--color-muted)]";
  }
}

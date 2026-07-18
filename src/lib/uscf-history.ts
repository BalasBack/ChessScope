import type { UscfMember, UscfRatingSnapshot } from "./types";

const KEY = "chessscope-uscf-history";

function loadAll(): Record<string, UscfRatingSnapshot[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, UscfRatingSnapshot[]>) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function recordUscfSnapshot(member: UscfMember): UscfRatingSnapshot[] {
  const all = loadAll();
  const history = all[member.id] ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const last = history[history.length - 1];
  const sameDay = last?.date === today;
  const snap: UscfRatingSnapshot = {
    date: today,
    ratings: member.ratings.map((r) => ({ ...r })),
  };
  if (sameDay) {
    history[history.length - 1] = snap;
  } else {
    history.push(snap);
  }
  if (history.length > 24) history.splice(0, history.length - 24);
  all[member.id] = history;
  saveAll(all);
  return history;
}

export function getUscfHistory(uscfId: string): UscfRatingSnapshot[] {
  return loadAll()[uscfId] ?? [];
}

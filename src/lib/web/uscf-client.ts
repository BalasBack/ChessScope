import type { OpponentCandidate, UscfMember, UscfRating } from "../types";

const BASE = "https://ratings-api.uschess.org/api/v1/members";

/** USCF API uses short codes; normalize to names the rest of the app expects. */
const SYSTEM_MAP: Record<string, string> = {
  R: "OverTheBoardRegular",
  Q: "OverTheBoardQuick",
  B: "OverTheBoardBlitz",
  OR: "OnlineRegular",
  OQ: "OnlineQuick",
  OB: "OnlineBlitz",
};

type ApiRating = {
  ratingSystem?: string;
  rating?: number;
  gamesPlayed?: number;
  isProvisional?: boolean;
};

type ApiMember = {
  id?: string | number;
  firstName?: string;
  lastName?: string;
  stateRep?: string;
  fideId?: string | number;
  status?: string;
  ratings?: ApiRating[];
};

type SearchResponse = {
  items?: ApiMember[];
};

function normalizeSystem(code: string): string {
  return SYSTEM_MAP[code] ?? code;
}

function mapMember(m: ApiMember): UscfMember {
  const id = String(m.id ?? "").trim();
  if (!id) throw new Error("Invalid USCF member response (missing id)");
  return {
    id,
    first_name: m.firstName ?? "",
    last_name: m.lastName ?? "",
    state: m.stateRep ?? null,
    fide_id: m.fideId != null ? String(m.fideId) : null,
    status: m.status ?? null,
    ratings: (m.ratings ?? []).map(
      (r): UscfRating => ({
        rating_system: normalizeSystem(r.ratingSystem ?? ""),
        rating: r.rating ?? null,
        games_played: r.gamesPlayed ?? null,
        is_provisional: !!r.isProvisional,
      }),
    ),
  };
}

/**
 * Browser calls to ratings-api.uschess.org are blocked by CORS.
 * Try direct first, then public read-through proxies.
 */
async function fetchUscfJson(url: string): Promise<unknown> {
  const attempts: Array<() => Promise<Response>> = [
    () => fetch(url),
    () => fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`),
    () =>
      fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
  ];

  let lastErr: unknown = null;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) {
        lastErr = new Error(`USCF request failed (${res.status})`);
        if (res.status === 404) throw lastErr;
        continue;
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        lastErr = new Error("Invalid USCF JSON response");
      }
    } catch (e) {
      lastErr = e;
      // TypeError: Failed to fetch → try next proxy
    }
  }
  throw new Error(
    lastErr instanceof Error
      ? lastErr.message
      : "USCF lookup failed (network/CORS). Try again, or use the desktop app.",
  );
}

export async function lookupUscfMember(uscfId: string): Promise<UscfMember> {
  const id = uscfId.trim();
  if (!id) throw new Error("Enter a USCF member ID");
  const data = (await fetchUscfJson(
    `${BASE}/${encodeURIComponent(id)}`,
  )) as ApiMember;
  return mapMember(data);
}

function parseNameQuery(query: string): {
  first: string | null;
  last: string | null;
} {
  const q = query.trim();
  if (!q) return { first: null, last: null };
  if (q.includes(",")) {
    const parts = q.split(",").map((s) => s.trim());
    return {
      first: parts[1] || null,
      last: parts[0] || null,
    };
  }
  const parts = q.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function fetchMembers(
  first: string | null,
  last: string | null,
  limit: number,
): Promise<UscfMember[]> {
  const params = new URLSearchParams({ pageSize: String(limit) });
  if (last) params.set("lastName", last);
  if (first) params.set("firstName", first);
  const data = (await fetchUscfJson(
    `${BASE}?${params.toString()}`,
  )) as SearchResponse;
  return (data.items ?? []).map(mapMember);
}

export async function searchUscfMembers(
  query: string,
  limit = 12,
): Promise<UscfMember[]> {
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    try {
      return [await lookupUscfMember(q)];
    } catch {
      return [];
    }
  }

  const { first, last } = parseNameQuery(q);
  const seen = new Set<string>();
  const out: UscfMember[] = [];
  const merge = (members: UscfMember[]) => {
    for (const m of members) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
  };

  if (first && last && first === last) {
    merge(await fetchMembers(null, last, limit));
    merge(await fetchMembers(first, null, limit));
  } else {
    merge(await fetchMembers(first, last, limit));
  }
  return out.slice(0, limit);
}

export function memberToCandidate(member: UscfMember): OpponentCandidate {
  const primary =
    member.ratings.find(
      (r) => r.rating_system.includes("Regular") && r.rating != null,
    )?.rating ??
    member.ratings.find((r) => r.rating != null)?.rating ??
    null;
  return {
    id: `uscf_${member.id}`,
    name: `${member.first_name} ${member.last_name}`.trim(),
    source: "uscf",
    rating: primary,
    federation: member.state,
    fide_id: member.fide_id,
    uscf_id: member.id,
    chessgames_id: null,
    chesscom_username: null,
    lichess_username: null,
  };
}

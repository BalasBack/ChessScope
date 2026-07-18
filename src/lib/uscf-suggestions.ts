import type { UscfMember, UscfRating } from "./types";

const SHORT_SYSTEM: Record<string, string> = {
  R: "OTB Regular",
  Q: "OTB Quick",
  B: "OTB Blitz",
  OR: "Online Regular",
  OQ: "Online Quick",
  OB: "Online Blitz",
};

function formatSystem(system: string): string {
  if (SHORT_SYSTEM[system]) return SHORT_SYSTEM[system];
  return system
    .replace("OverTheBoard", "OTB ")
    .replace("Online", "Online ")
    .replace("Regular", "Regular")
    .replace("Quick", "Quick")
    .replace("Blitz", "Blitz");
}

function findRating(
  member: UscfMember,
  ...systems: string[]
): UscfRating | undefined {
  const aliases = systems.flatMap((s) => {
    if (s.includes("OverTheBoardRegular") || s === "Regular")
      return [s, "OverTheBoardRegular", "R"];
    if (s.includes("OverTheBoardQuick") || s === "Quick")
      return [s, "OverTheBoardQuick", "Q"];
    if (s.includes("OverTheBoardBlitz") || s === "Blitz")
      return [s, "OverTheBoardBlitz", "B"];
    if (s.includes("OnlineRegular")) return [s, "OnlineRegular", "OR"];
    if (s.includes("OnlineQuick")) return [s, "OnlineQuick", "OQ"];
    if (s.includes("OnlineBlitz")) return [s, "OnlineBlitz", "OB"];
    return [s];
  });
  return member.ratings.find((r) =>
    aliases.some(
      (a) => r.rating_system === a || r.rating_system.includes(a),
    ),
  );
}

function primaryOtbRating(member: UscfMember): number | null {
  const r =
    findRating(member, "OverTheBoardRegular") ??
    findRating(member, "OverTheBoardQuick") ??
    findRating(member, "OverTheBoardBlitz");
  return r?.rating ?? null;
}

export interface UscfSuggestion {
  title: string;
  detail: string;
}

export function buildUscfSuggestions(member: UscfMember): UscfSuggestion[] {
  const out: UscfSuggestion[] = [];
  const otbRegular = findRating(member, "OverTheBoardRegular");
  const otbQuick = findRating(member, "OverTheBoardQuick");
  const otbBlitz = findRating(member, "OverTheBoardBlitz");
  const onlineRegular = findRating(member, "OnlineRegular");
  const primary = primaryOtbRating(member);

  const provisional = member.ratings.filter((r) => r.is_provisional);
  if (provisional.length > 0) {
    const names = provisional.map((r) => formatSystem(r.rating_system)).join(", ");
    out.push({
      title: "Establish your ratings",
      detail: `${names} ${provisional.length === 1 ? "is" : "are"} still provisional. Play more rated games in ${names.includes("OTB") ? "over-the-board" : "those"} sections so your rating reflects your true strength before choosing a tournament section.`,
    });
  }

  if (primary != null) {
    if (primary < 1000) {
      out.push({
        title: "Build fundamentals",
        detail:
          "Focus on basic tactics (pins, forks, back-rank mates) and simple opening principles. Use Training blunder puzzles and aim for 15–20 minutes of tactics daily.",
      });
    } else if (primary < 1400) {
      out.push({
        title: "Sharpen tactics and opening repertoire",
        detail:
          "At this level, most losses come from one-move blunders and unfamiliar opening positions. Pick one opening as White and one defense as Black, then review your Analysis tab for recurring mistakes.",
      });
    } else if (primary < 1800) {
      out.push({
        title: "Deepen opening prep and calculation",
        detail:
          "Study model games in your main openings, review long time-control games in Analysis, and practice candidate-move calculation. Consider USCF Quick or Regular events to stress-test prep.",
      });
    } else {
      out.push({
        title: "Tournament-style preparation",
        detail:
          "Prioritize opponent-specific prep in Opponent Scout, review critical moments from recent OTB games, and simulate tournament conditions (longer time controls, no takebacks).",
      });
    }
  }

  if (
    otbRegular?.rating != null &&
    otbBlitz?.rating != null &&
    Math.abs(otbRegular.rating - otbBlitz.rating) >= 150
  ) {
    const higher = otbRegular.rating > otbBlitz.rating ? "Regular" : "Blitz";
    const lower = higher === "Regular" ? "Blitz" : "Regular";
    out.push({
      title: "Balance time controls",
      detail: `Your OTB ${higher} rating is much higher than ${lower}. If you mostly play ${lower.toLowerCase()} events, try more ${higher.toLowerCase()} games — or adjust prep to match the time control you enter most often.`,
    });
  }

  if (
    otbRegular?.rating != null &&
    onlineRegular?.rating != null &&
    Math.abs(otbRegular.rating - onlineRegular.rating) >= 200
  ) {
    out.push({
      title: "OTB vs online gap",
      detail:
        "Your online and OTB ratings differ significantly. Before a live tournament, play a few long OTB-style games (or slow online) to calibrate nerves, clock management, and notation habits.",
    });
  }

  if (otbQuick?.rating != null && otbRegular?.rating != null) {
    if (otbQuick.rating > otbRegular.rating + 100) {
      out.push({
        title: "Strong in Quick chess",
        detail:
          "You perform well in Quick (G/30) events. Look for USCF Quick-rated tournaments in your state — they suit your current results profile.",
      });
    }
  }

  if (!member.fide_id) {
    out.push({
      title: "Consider FIDE registration",
      detail:
        "No FIDE ID on file. If you plan international or norm-track events, ask your USCF affiliate about FIDE registration after your OTB rating stabilizes.",
    });
  }

  if (member.state) {
    out.push({
      title: `State events (${member.state})`,
      detail: `Check the ${member.state} state chess association calendar for upcoming USCF-rated swisses and quads. Enter a section within ±100 points of your ${otbRegular?.rating ?? primary ?? "current"} OTB Regular rating when possible.`,
    });
  }

  if (member.status && member.status.toLowerCase() !== "active") {
    out.push({
      title: "Membership status",
      detail: `USCF status: ${member.status}. Renew or update membership before registering for rated tournaments.`,
    });
  }

  if (out.length === 0) {
    out.push({
      title: "Keep tracking your games",
      detail:
        "Import your Chess.com and Lichess games in Settings, sync from the Dashboard, and use Analysis to find patterns before your next rated event.",
    });
  }

  return out;
}

export { formatSystem };

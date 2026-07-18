import type { PlayerStatsSummary, UscfMember } from "./types";
import { formatSystem } from "./uscf-suggestions";
import { coachChat, checkOllama, formatCoachProfile } from "./ollama-client";

export async function generateUscfAiSuggestions(
  member: UscfMember,
  playerStats: PlayerStatsSummary,
  model: string,
): Promise<string> {
  const status = await checkOllama();
  if (!status.connected) {
    throw new Error(status.error ?? "Ollama not connected");
  }

  const ratings = member.ratings
    .filter((r) => r.rating != null)
    .map(
      (r) =>
        `${formatSystem(r.rating_system)}: ${r.rating}${r.is_provisional ? " (provisional)" : ""}, ${r.games_played ?? 0} games`,
    )
    .join("\n");

  const prompt = `USCF member ${member.first_name} ${member.last_name} (#${member.id}), state ${member.state ?? "unknown"}, status ${member.status ?? "unknown"}.

Current USCF ratings:
${ratings}

My online chess stats (NOT opponent games):
${formatCoachProfile(playerStats)}

Give 4-6 specific tournament prep recommendations for this player. Cover: ideal section rating range, time control strengths, opening prep priorities, and a 1-week study plan. Be concise with bullet points.`;

  return coachChat(
    model,
    [{ role: "user", content: prompt }],
    "No extra profile data.",
  );
}

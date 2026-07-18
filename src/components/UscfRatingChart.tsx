import type { UscfMember, UscfRatingSnapshot } from "../lib/types";
import { formatSystem } from "../lib/uscf-suggestions";

function primaryRatings(member: UscfMember) {
  return member.ratings.filter((r) => r.rating != null);
}

export function UscfRatingBarChart({ member }: { member: UscfMember }) {
  const rows = primaryRatings(member);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.rating ?? 0), 1000);

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = ((r.rating ?? 0) / max) * 100;
        return (
          <div key={r.rating_system}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[var(--color-muted)]">
                {formatSystem(r.rating_system)}
              </span>
              <span className="font-semibold">{r.rating}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-hover)] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UscfRatingTrendChart({
  history,
  system = "OverTheBoardRegular",
}: {
  history: UscfRatingSnapshot[];
  system?: string;
}) {
  const points = history
    .map((h) => {
      const r = h.ratings.find(
        (x) =>
          x.rating_system === system ||
          (system === "OverTheBoardRegular" &&
            (x.rating_system === "R" ||
              x.rating_system.includes("OverTheBoardRegular"))),
      );
      return r?.rating != null ? { date: h.date, rating: r.rating } : null;
    })
    .filter((p): p is { date: string; rating: number } => p != null);

  if (points.length < 2) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Look up your profile on different days to build a rating trend chart.
      </p>
    );
  }

  const w = 400;
  const h = 120;
  const pad = 24;
  const minR = Math.min(...points.map((p) => p.rating)) - 50;
  const maxR = Math.max(...points.map((p) => p.rating)) + 50;
  const x = (i: number) =>
    pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (r: number) =>
    h - pad - ((r - minR) / (maxR - minR)) * (h - pad * 2);

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.rating)}`)
    .join(" ");

  return (
    <div>
      <div className="mb-2 text-xs text-[var(--color-muted)]">
        OTB Regular trend ({points[0].rating} → {points[points.length - 1].rating})
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-lg">
        <path
          d={d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.rating)}
            r="4"
            fill="var(--color-accent)"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-muted)]">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

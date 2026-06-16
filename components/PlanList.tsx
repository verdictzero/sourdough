import type { Plan } from "@/lib/db/types";

export function formatPrice(priceCents: number, interval: string | null): string {
  if (priceCents === 0) return "Free";
  const dollars = (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
  return `$${dollars}${interval ? `/${interval}` : ""}`;
}

function limit(label: string, value: number | null, unit: string): string {
  return value == null ? `Unlimited ${label}` : `${value.toLocaleString()} ${unit}`;
}

export function PlanList({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) return <p className="muted">No plans defined.</p>;
  return (
    <div className="plan-grid">
      {plans.map((p) => (
        <div className="plan" key={p.id}>
          <div className="plan-head">
            <strong>{p.name}</strong>
            <span className="plan-price">{formatPrice(p.priceCents, p.interval)}</span>
          </div>
          <ul className="plan-limits">
            <li>{limit("calls", p.quotaMonth, "calls / month")}</li>
            <li>{limit("rate", p.rateLimitPerMin, "req / min")}</li>
          </ul>
        </div>
      ))}
    </div>
  );
}

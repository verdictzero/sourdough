import type {
  Pricing,
  ApiStatus,
  SubscriptionStatus,
} from "@/lib/db/types";

export function PricingBadge({ pricing }: { pricing: Pricing }) {
  return <span className={`badge ${pricing}`}>{pricing}</span>;
}

export function StatusBadge({
  status,
}: {
  status: ApiStatus | SubscriptionStatus;
}) {
  return <span className={`badge ${status}`}>{status}</span>;
}

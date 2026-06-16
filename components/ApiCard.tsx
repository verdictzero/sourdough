import Link from "next/link";
import type { ApiListing } from "@/lib/db/types";
import { PricingBadge } from "./badges";

export function ApiCard({ api }: { api: ApiListing }) {
  return (
    <Link href={`/apis/${api.slug}`} className="card">
      <div className="card-head">
        <span className="badge">{api.category}</span>
        <PricingBadge pricing={api.pricing} />
      </div>
      <h3>{api.name}</h3>
      <p className="tagline">{api.tagline}</p>
      <div className="card-foot">
        <span>{api.provider}</span>
        <span>{api.version}</span>
      </div>
    </Link>
  );
}

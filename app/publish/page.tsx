import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PublishWizard } from "@/components/PublishWizard";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/publish");
  return <PublishWizard />;
}

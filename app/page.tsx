import { QuerySurface } from "@/components/query/QuerySurface";
import { requireSession } from "@/lib/auth";

export default async function HomePage() {
  await requireSession();
  return <QuerySurface />;
}

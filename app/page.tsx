import { requireSession } from "@/lib/auth";
import { Search } from "./search";

export default async function SearchPage() {
  await requireSession();
  return (
    <main className="page">
      <div className="page__main">
        <Search />
      </div>
    </main>
  );
}

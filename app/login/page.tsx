import type { Metadata } from "next";
import { OwnerLogin } from "@/components/auth/OwnerLogin";

export const metadata: Metadata = { title: "flaneur" };
export default function LoginPage() {
  return <main className="page"><OwnerLogin /></main>;
}

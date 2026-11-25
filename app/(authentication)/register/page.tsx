import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/auth/safe-next";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <RegisterForm next={safeNext((await searchParams).next, "/portal")} />;
}

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("employee");
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}

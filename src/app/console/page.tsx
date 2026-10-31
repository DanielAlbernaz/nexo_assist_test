import { Console } from "@/components/console";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const user = await requireUser("analyst");
  return <Console me={{ id: user.id, name: user.name, level: user.level }} />;
}

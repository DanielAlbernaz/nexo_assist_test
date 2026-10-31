import { Chat } from "@/components/chat";
import { requireUser } from "@/lib/auth";

export default async function ChatPage() {
  const user = await requireUser("employee");
  return <Chat firstName={user.name.split(" ")[0] ?? user.name} />;
}

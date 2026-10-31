import { cancelDraft } from "@/chat/drafts";
import { apiError, isResponse, json, requireApiUser } from "@/lib/api";
import { db } from "@/lib/services";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser("employee");
  if (isResponse(user)) return user;
  const { id } = await params;
  const ok = await cancelDraft(db, id, user.id);
  return ok ? json({ ok: true }) : apiError(404, "Rascunho não encontrado ou já tratado.");
}

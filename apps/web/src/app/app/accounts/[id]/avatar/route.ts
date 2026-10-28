import { prisma } from "@invytra/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** The connected LinkedIn account's own profile photo (this workspace's accounts only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const a = await prisma.linkedinAccount.findFirst({
    where: { id: String(id), workspaceId: me.workspace.id },
    select: { avatar: true, avatarType: true },
  });
  if (!a?.avatar || !a.avatarType || !TYPES.has(a.avatarType)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.avatar), {
    headers: {
      "content-type": a.avatarType,
      // The URL changes (?v=…) whenever the photo does.
      "cache-control": "private, max-age=604800, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

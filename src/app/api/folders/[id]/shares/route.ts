import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { getShareLink, listShares } from "@/lib/shares";
import { LIMITS } from "@/lib/limits";
import { rateLimit } from "@/lib/rateLimit";
import { validateCreateShare } from "@/lib/validators";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { Share, normalizePermissions } from "@/models/Share";
import { User } from "@/models/User";
import { publishFolderAccess, publishFolderEvent } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import type { ShareListResponse } from "@/types";

// Who a folder is shared with. Owner only (canManage): a shared user gets
// 403, anyone else 404.

type Ctx = RouteContext<"/api/folders/[id]/shares">;

// GET /api/folders/:id/shares → { shares, link }
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    if (!access.canManage) return jsonError("Only the owner can see who this folder is shared with", 403);

    const origin = new URL(request.url).origin;
    const [shares, link] = await Promise.all([listShares(access.folder._id), getShareLink(access.folder._id, origin)]);
    const body: ShareListResponse = { shares, link };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders/:id/shares: { email, canCheck?, canEdit? } → { shares, link }.
// Sharing again with the same person just updates their permissions.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    // The "no such user" answer reveals whether an email is registered, so
    // slow down anyone trying many emails.
    const limit = rateLimit(`share:${user.id}`, { limit: 30 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    if (!access.canManage) return jsonError("Only the owner can share this folder", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateCreateShare(body);
    if (!result.ok) return jsonError(result.error, 400);
    const { email, canCheck, canEdit } = result.value;

    const target = await User.findOne({ email }).select("_id").lean();
    if (!target) return jsonError("No Listy user with this email", 404);
    if (String(target._id) === user.id) return jsonError("You already own this folder", 400);

    const folderId = access.folder._id;
    const existing = await Share.exists({ folder: folderId, sharedWith: target._id });
    if (!existing && (await Share.countDocuments({ folder: folderId })) >= LIMITS.SHARES_PER_FOLDER) {
      return jsonError(`A folder can be shared with at most ${LIMITS.SHARES_PER_FOLDER} people`, 400);
    }

    await Share.updateOne(
      { folder: folderId, sharedWith: target._id },
      {
        $set: normalizePermissions(canCheck, canEdit),
        // Only set on first share, so re-sharing doesn't change how they joined.
        $setOnInsert: { owner: access.folder.owner, via: "email" },
      },
      { upsert: true }
    );

    const res: ShareListResponse = {
      shares: await listShares(folderId),
      link: await getShareLink(folderId, new URL(request.url).origin),
    };
    // Re-sharing changed an existing person's permissions: their open screen should update.
    if (existing) await publishFolderEvent(String(folderId), EVENTS.accessChanged, { userId: String(target._id) });
    // A new share: their "Shared with me" list gains this folder.
    else await publishFolderAccess(String(target._id), String(folderId));
    return Response.json(res, { status: existing ? 200 : 201 });
  } catch (err) {
    return serverError(err);
  }
}

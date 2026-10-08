import { requireUser } from "@/lib/auth";
import { LIMITS } from "@/lib/limits";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { Folder } from "@/models/Folder";
import { Share, normalizePermissions } from "@/models/Share";
import { ShareLink, isShareTokenShape } from "@/models/ShareLink";
import type { AcceptShareResponse } from "@/types";

// POST /api/share/:token/accept → { folderId }.
// A logged-in user opened a share link: give them the folder with the
// link's permissions. Invalid or turned-off links are a plain 404.

type Ctx = RouteContext<"/api/share/[token]/accept">;

const INVALID = "This link is not valid or was turned off";

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    // Slow down anyone trying to guess tokens (per IP, before any DB work).
    const limit = rateLimit(`accept:${getClientIp(request)}`, { limit: 30 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { token } = await ctx.params;
    if (!isShareTokenShape(token)) return jsonError(INVALID, 404);

    const link = await ShareLink.findOne({ token, enabled: true }).lean();
    if (!link) return jsonError(INVALID, 404);
    const folder = await Folder.findById(link.folder).select("owner").lean();
    if (!folder) return jsonError(INVALID, 404);

    const body: AcceptShareResponse = { folderId: String(folder._id) };
    // The owner opening their own link: nothing to do.
    if (String(folder.owner) === user.id) return Response.json(body);

    const existing = await Share.findOne({ folder: folder._id, sharedWith: user.id });
    if (existing) {
      // Never take permissions away: keep whichever is more (email share or link).
      existing.set(normalizePermissions(existing.canCheck || link.canCheck, existing.canEdit || link.canEdit));
      await existing.save();
      return Response.json(body);
    }

    if ((await Share.countDocuments({ folder: folder._id })) >= LIMITS.SHARES_PER_FOLDER) {
      return jsonError("This folder is already shared with the maximum number of people", 400);
    }
    await Share.create({
      folder: folder._id,
      owner: folder.owner,
      sharedWith: user.id,
      ...normalizePermissions(link.canCheck, link.canEdit),
      via: "link",
    });
    return Response.json(body, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

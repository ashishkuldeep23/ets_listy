import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { validateRenameGroup } from "@/lib/validators";
import { getSocketId, publishFolderEvent } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Item } from "@/models/Item";
import { existingGroupName } from "@/lib/items";

// POST /api/folders/:id/groups/rename: { from, to } → { updated }.
// Renames a group by changing `group` on all of its items in this folder
// (groups have no document of their own). `to: null` ungroups them.
// Needs canEdit.

type Ctx = RouteContext<"/api/folders/[id]/groups/rename">;

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("List not found", 404);
    if (!access.canEdit) return jsonError("You can't edit items in this list", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateRenameGroup(body);
    if (!result.ok) return jsonError(result.error, 400);
    const { from } = result.value;
    // Renaming onto another group in a different case merges into its spelling.
    const to = result.value.to && (await existingGroupName(access.folder._id, result.value.to, { exceptGroup: from }));

    const update = to === null ? { $unset: { group: "" } } : { $set: { group: to } };
    const { modifiedCount } = await Item.updateMany({ folder: access.folder._id, group: from }, update);
    if (modifiedCount > 0) {
      await publishFolderEvent(id, EVENTS.groupRenamed, { from, to }, getSocketId(request));
    }
    return Response.json({ updated: modifiedCount });
  } catch (err) {
    return serverError(err);
  }
}

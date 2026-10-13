import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { validateRenameGroup } from "@/lib/validators";
import { getSocketId, publishFolderEvent } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Item } from "@/models/Item";
import { existingGroupName } from "@/lib/items";
import type { Types } from "mongoose";

// POST /api/folders/:id/groups/rename: { from, to } → { updated } (+ itemIds when from is null).
// Renames a group by changing `group` on all of its items in this folder
// (groups have no document of their own). `to: null` ungroups them.
// `from: null` gives all ungrouped items the group `to` (+ returns their ids).
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
    const to =
      result.value.to && (await existingGroupName(access.folder._id, result.value.to, { exceptGroup: from ?? undefined }));

    if (from === null) {
      // The validator already requires a name here; this also narrows `to` to a string.
      if (!to) return jsonError("Enter a group name", 400);
      return groupUngrouped(access.folder._id, id, to, getSocketId(request));
    }

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

// Ungrouped items have no `group` (older ones may hold null or "").
const UNGROUPED_FILTER = { $in: [null, ""] };

/**
 * Gives every ungrouped item in the folder the group `to`. Returns the moved
 * item ids so screens move exactly these items: one added ungrouped by
 * someone else a moment later must stay ungrouped.
 */
async function groupUngrouped(
  folderId: Types.ObjectId,
  id: string,
  to: string,
  socketId: string | undefined
): Promise<Response> {
  const found = await Item.find({ folder: folderId, group: UNGROUPED_FILTER }).select("_id").lean();
  const ids = found.map((i) => i._id);
  if (ids.length === 0) return Response.json({ updated: 0, itemIds: [] });

  // Re-check "ungrouped" so an item regrouped since the find above is not overwritten.
  await Item.updateMany({ _id: { $in: ids }, folder: folderId, group: UNGROUPED_FILTER }, { $set: { group: to } });
  const moved = await Item.find({ _id: { $in: ids }, folder: folderId, group: to }).select("_id").lean();
  const itemIds = moved.map((i) => String(i._id));
  if (itemIds.length > 0) {
    await publishFolderEvent(id, EVENTS.groupRenamed, { from: null, to, itemIds }, socketId);
  }
  return Response.json({ updated: itemIds.length, itemIds });
}

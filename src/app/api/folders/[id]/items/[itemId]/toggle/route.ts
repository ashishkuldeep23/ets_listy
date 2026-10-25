import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { validateToggle } from "@/lib/validators";
import { getSocketId, publishFolderEvent, publishFolderProgress } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { completeFolderIfAllDone } from "@/lib/items";
import { serializeFolder } from "@/models/Folder";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Item, DONE_BY_NAME, serializeItem, type ItemDoc } from "@/models/Item";

// POST /api/folders/:id/items/:itemId/toggle: { done }. Needs canCheck.
// A separate route (not PATCH) so sharing can allow "tick only" without
// allowing edits.

type Ctx = RouteContext<"/api/folders/[id]/items/[itemId]/toggle">;

const NOT_FOUND = "Item not found";

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id, itemId } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canCheck) return jsonError("You can't tick items in this list", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateToggle(body);
    if (!result.ok) return jsonError(result.error, 400);

    if (!mongoose.isValidObjectId(itemId)) return jsonError(NOT_FOUND, 404);

    // Record who ticked it and when; clear both when unticked.
    const { done, notFound } = result.value;
    const update = done
      ? {
          $set: { done: true, doneBy: user.id, doneAt: new Date(), ...(notFound && { notFound: true }) },
          $unset: { doneByGuest: "", ...(!notFound && { notFound: "" }) },
        }
      : { $set: { done: false }, $unset: { doneBy: "", doneByGuest: "", doneAt: "", notFound: "" } };

    // Filtering by folder too means an item from another folder is simply "not found".
    const item = await Item.findOneAndUpdate({ _id: itemId, folder: access.folder._id }, update, {
      returnDocument: "after",
    })
      .populate(DONE_BY_NAME)
      .lean<ItemDoc>();
    if (!item) return jsonError(NOT_FOUND, 404);
    const dto = serializeItem(item);
    await publishFolderEvent(id, EVENTS.itemUpdated, { item: dto }, getSocketId(request));
    // Everything done → the list moves to "completed" (sent to everyone, me included).
    const completed = await completeFolderIfAllDone(access.folder._id);
    if (completed) await publishFolderEvent(id, EVENTS.folderUpdated, { folder: serializeFolder(completed) });
    await publishFolderProgress(access.folder._id);
    return Response.json(dto);
  } catch (err) {
    return serverError(err);
  }
}

import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { toItemUpdate } from "@/lib/items";
import { getSocketId, publishFolderEvent, publishFolderProgress } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { validateUpdateItem } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Item, DONE_BY_NAME, serializeItem, type ItemDoc } from "@/models/Item";

// Edit or delete one item. Both need canEdit on the folder, and the item
// must belong to the folder in the URL (otherwise 404).

type Ctx = RouteContext<"/api/folders/[id]/items/[itemId]">;

const NOT_FOUND = "Item not found";

// PATCH /api/folders/:id/items/:itemId: any of { name, category, price, description, group }; null clears a field.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id, itemId } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canEdit) return jsonError("You can't edit items in this folder", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateUpdateItem(body);
    if (!result.ok) return jsonError(result.error, 400);

    if (!mongoose.isValidObjectId(itemId)) return jsonError(NOT_FOUND, 404);
    // Filtering by folder too means an item from another folder is simply "not found".
    const item = await Item.findOneAndUpdate({ _id: itemId, folder: access.folder._id }, toItemUpdate(result.value), {
      returnDocument: "after",
      runValidators: true,
    })
      .populate(DONE_BY_NAME)
      .lean<ItemDoc>();
    if (!item) return jsonError(NOT_FOUND, 404);
    const dto = serializeItem(item);
    await publishFolderEvent(id, EVENTS.itemUpdated, { item: dto }, getSocketId(request));
    return Response.json(dto);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/folders/:id/items/:itemId
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id, itemId } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canEdit) return jsonError("You can't delete items in this folder", 403);

    if (!mongoose.isValidObjectId(itemId)) return jsonError(NOT_FOUND, 404);
    const { deletedCount } = await Item.deleteOne({ _id: itemId, folder: access.folder._id });
    if (deletedCount === 0) return jsonError(NOT_FOUND, 404);
    await publishFolderEvent(id, EVENTS.itemDeleted, { itemId }, getSocketId(request));
    await publishFolderProgress(access.folder._id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

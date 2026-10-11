import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { validateToggle } from "@/lib/validators";
import { publishFolderEvent, publishFolderProgress } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { Item, DONE_BY_NAME, serializeItem, type ItemDoc } from "@/models/Item";
import { ShareLink, isShareTokenShape } from "@/models/ShareLink";

// POST /api/share/:token/items/:itemId/toggle: { done } → the item (doneBy hidden).
// Lets ANYONE holding the link tick items, logged in or not, but only while
// the link is on and the owner allowed ticking on it. The owner and everyone
// in the list see the change live, marked "by Guest".

type Ctx = RouteContext<"/api/share/[token]/items/[itemId]/toggle">;

const INVALID = "This link is not valid or was turned off";

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    // No login here, so limit per IP (before any DB work).
    const limit = rateLimit(`share-toggle:${getClientIp(request)}`, { limit: 200 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { token, itemId } = await ctx.params;
    if (!isShareTokenShape(token)) return jsonError(INVALID, 404);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateToggle(body);
    if (!result.ok) return jsonError(result.error, 400);

    await connectDB();
    const link = await ShareLink.findOne({ token, enabled: true }).lean();
    if (!link) return jsonError(INVALID, 404);
    // Edit always includes tick (same rule as shares).
    if (!link.canCheck && !link.canEdit) return jsonError("This link doesn't allow ticking items", 403);

    if (!mongoose.isValidObjectId(itemId)) return jsonError("Item not found", 404);

    const update = result.value.done
      ? { $set: { done: true, doneByGuest: true, doneAt: new Date() }, $unset: { doneBy: "" } }
      : { $set: { done: false }, $unset: { doneBy: "", doneByGuest: "", doneAt: "" } };
    // Filtering by the link's folder means items of other lists are "not found".
    const item = await Item.findOneAndUpdate({ _id: itemId, folder: link.folder }, update, { returnDocument: "after" })
      .populate(DONE_BY_NAME)
      .lean<ItemDoc>();
    if (!item) return jsonError("Item not found", 404);

    // Live: the owner's (and shared users') open screens update via Pusher.
    await publishFolderEvent(String(link.folder), EVENTS.itemUpdated, { item: serializeItem(item) });
    await publishFolderProgress(link.folder);
    // Guests never see names, same as the public view.
    return Response.json({ ...serializeItem(item), doneBy: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}

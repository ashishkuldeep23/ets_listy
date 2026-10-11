import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { countItems, existingGroupName } from "@/lib/items";
import { upsertSavedItem } from "@/lib/savedItems";
import { getSocketId, publishFolderEvent, publishFolderProgress } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import { itemExistsMessage, itemNameTaken } from "@/lib/duplicates";
import { LIMITS } from "@/lib/limits";
import { validateCreateItem, withoutGroup } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Item, DONE_BY_NAME, serializeItem, type ItemDoc } from "@/models/Item";
import type { ItemListResponse } from "@/types";

type Ctx = RouteContext<"/api/folders/[id]/items">;

const NOT_FOUND = "List not found";

// GET /api/folders/:id/items → { items, total, done, groups }. Any access may read.
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    const folderId = access.folder._id;
    const [items, counts, groups] = await Promise.all([
      Item.find({ folder: folderId }).sort({ position: 1 }).populate(DONE_BY_NAME).lean<ItemDoc[]>(),
      countItems(folderId),
      Item.distinct("group", { folder: folderId, group: { $nin: [null, ""] } }),
    ]);
    const body: ItemListResponse = {
      items: items.map(serializeItem),
      ...counts,
      groups: (groups as string[]).sort((a, b) => a.localeCompare(b)),
    };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders/:id/items: { name, category?, price?, priceUnit?, quantity?, description?, group?, saveToProfile? }. Needs canEdit.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canEdit) return jsonError("You can't add items to this list", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateCreateItem(body);
    if (!result.ok) return jsonError(result.error, 400);

    const folderId = access.folder._id;
    if ((await Item.countDocuments({ folder: folderId })) >= LIMITS.ITEMS_PER_FOLDER) {
      return jsonError(`A list can hold at most ${LIMITS.ITEMS_PER_FOLDER} items`, 400);
    }

    if (await itemNameTaken(folderId, result.value.fields.name)) {
      return jsonError(itemExistsMessage(result.value.fields.name), 409);
    }

    // New items go to the end of the list.
    const last = await Item.findOne({ folder: folderId }).sort({ position: -1 }).select("position").lean();
    const { fields: input, saveToProfile } = result.value;
    if (input.group) input.group = await existingGroupName(folderId, input.group);
    // A unit without a price means nothing ("/ kg" of what?).
    if (input.price == null) delete input.priceUnit;

    // Save to the CURRENT user's profile (not the folder owner's). Done before
    // creating the item so a full library fails the request cleanly.
    if (saveToProfile) {
      const saved = await upsertSavedItem(user.id, withoutGroup(input));
      if (!saved) return jsonError(`Your saved items are full (max ${LIMITS.SAVED_ITEMS_PER_USER})`, 400);
    }

    // null fields from the validator mean "empty": just leave them out on create.
    const fields = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null));

    const item = await Item.create({
      ...fields,
      folder: folderId,
      position: (last?.position ?? -1) + 1,
      createdBy: user.id,
    });
    const dto = serializeItem(item.toObject());
    await publishFolderEvent(String(folderId), EVENTS.itemCreated, { item: dto }, getSocketId(request));
    await publishFolderProgress(folderId);
    return Response.json(dto, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}


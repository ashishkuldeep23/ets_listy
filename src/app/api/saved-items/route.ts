import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { escapeRegex, upsertSavedItem } from "@/lib/savedItems";
import { LIMITS } from "@/lib/limits";
import { cleanSearchQuery, validateCreateSavedItem } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { SavedItem, serializeSavedItem } from "@/models/SavedItem";
import type { SavedItemListResponse } from "@/types";

// My saved items (profile library). Always scoped to the logged-in user.

// GET /api/saved-items?q=milk → { savedItems }, most recently saved first.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const q = cleanSearchQuery(new URL(request.url).searchParams.get("q"));
    await connectDB();
    const items = await SavedItem.find({
      owner: user.id,
      // Case-insensitive "contains"; the text is escaped so it can't act as a pattern.
      ...(q && { name: { $regex: escapeRegex(q), $options: "i" } }),
    })
      .sort({ updatedAt: -1 })
      .limit(LIMITS.SAVED_ITEMS_PER_USER)
      .lean();

    const body: SavedItemListResponse = { savedItems: items.map(serializeSavedItem) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/saved-items: { name, category?, price?, description? }.
// Same name + category as an existing one updates it instead of duplicating.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateCreateSavedItem(body);
    if (!result.ok) return jsonError(result.error, 400);

    const saved = await upsertSavedItem(user.id, result.value);
    if (!saved) return jsonError(`Your saved items are full (max ${LIMITS.SAVED_ITEMS_PER_USER})`, 400);
    return Response.json(serializeSavedItem(saved), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

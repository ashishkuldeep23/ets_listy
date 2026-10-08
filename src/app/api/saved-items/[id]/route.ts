import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { updateSavedItem } from "@/lib/savedItems";
import { validateUpdateSavedItem } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { SavedItem, serializeSavedItem } from "@/models/SavedItem";

// Edit or delete one of MY saved items. Someone else's id is "not found".

type Ctx = RouteContext<"/api/saved-items/[id]">;

const NOT_FOUND = "Saved item not found";

// PATCH /api/saved-items/:id: any of { name, category, price, description }; null clears a field.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateUpdateSavedItem(body);
    if (!result.ok) return jsonError(result.error, 400);

    const { id } = await ctx.params;
    const updated = await updateSavedItem(user.id, id, result.value);
    if (updated === "notFound") return jsonError(NOT_FOUND, 404);
    if (updated === "duplicate") return jsonError("You already have a saved item with this name and category", 409);
    return Response.json(serializeSavedItem(updated));
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/saved-items/:id
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return jsonError(NOT_FOUND, 404);
    await connectDB();
    const { deletedCount } = await SavedItem.deleteOne({ _id: id, owner: user.id });
    if (deletedCount === 0) return jsonError(NOT_FOUND, 404);
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

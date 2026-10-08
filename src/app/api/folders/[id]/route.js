import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { validateUpdateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder } from "@/models/Folder";

// Access is decided only by getFolderAccess(): null → 404 (don't reveal
// the folder exists), missing permission → 403.

const NOT_FOUND = "Folder not found";

// GET /api/folders/:id
export async function GET(request, ctx) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    return Response.json({ ...serializeFolder(access.folder), role: access.role });
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/folders/:id: { name }
export async function PATCH(request, ctx) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canManage) return jsonError("Only the owner can change this folder", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateUpdateFolder(body);
    if (!result.ok) return jsonError(result.error, 400);

    const folder = await Folder.findByIdAndUpdate(
      id,
      { $set: result.value },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!folder) return jsonError(NOT_FOUND, 404);
    return Response.json(serializeFolder(folder));
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/folders/:id
export async function DELETE(request, ctx) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canManage) return jsonError("Only the owner can delete this folder", 403);

    // LATER PHASES: also delete this folder's items (Phase 2) and its
    // shares + share link (Phase 3) here, so nothing is left orphaned.
    await Folder.deleteOne({ _id: id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LIMITS } from "@/lib/limits";
import { validateCreateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder } from "@/models/Folder";

// GET /api/folders: my folders, newest first → { folders }.
export async function GET(request) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const folders = await Folder.find({ owner: user.id }).sort({ updatedAt: -1 }).lean();
    return Response.json({ folders: folders.map(serializeFolder) });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders: { name } → the new folder.
export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateCreateFolder(body);
    if (!result.ok) return jsonError(result.error, 400);

    await connectDB();
    // Cap per user so one account can't fill the database.
    if ((await Folder.countDocuments({ owner: user.id })) >= LIMITS.FOLDERS_PER_USER) {
      return jsonError(`You can have at most ${LIMITS.FOLDERS_PER_USER} folders`, 400);
    }

    const folder = await Folder.create({ ...result.value, owner: user.id });
    return Response.json(serializeFolder(folder), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

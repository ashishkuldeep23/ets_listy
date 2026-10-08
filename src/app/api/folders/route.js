import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_STATUS, STATUS_VALUES } from "@/lib/constants";
import { isValidStatus, validateCreateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder, statusFilter } from "@/models/Folder";

/**
 * GET /api/folders?status=pending
 * My folders, newest first, optionally filtered by status.
 * → { folders, counts: { all, active, pending, completed } }
 * Counts are always for all my folders, so filter chips can show them.
 */
export async function GET(request) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const status = new URL(request.url).searchParams.get("status");
    if (status !== null && !isValidStatus(status)) {
      return jsonError(`status must be one of: ${STATUS_VALUES.join(", ")}`, 400);
    }

    await connectDB();
    const owner = user.id;
    const [folders, grouped] = await Promise.all([
      Folder.find({ owner, ...(status && statusFilter(status)) }).sort({ updatedAt: -1 }).lean(),
      Folder.aggregate([
        // aggregate() skips Mongoose casting, so the id must be an ObjectId here.
        { $match: { owner: new mongoose.Types.ObjectId(owner) } },
        // Folders without a status count as the default one.
        { $group: { _id: { $ifNull: ["$status", DEFAULT_STATUS] }, n: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries(STATUS_VALUES.map((s) => [s, 0]));
    for (const g of grouped) if (Object.hasOwn(counts, g._id)) counts[g._id] = g.n;
    counts.all = grouped.reduce((sum, g) => sum + g.n, 0);

    return Response.json({ folders: folders.map(serializeFolder), counts });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders: { name, status? } → the new folder.
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

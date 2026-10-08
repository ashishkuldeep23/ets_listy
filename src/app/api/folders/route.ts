import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_STATUS, STATUS_VALUES, isFolderStatus, type FolderStatus } from "@/lib/constants";
import type { FolderCounts, FolderListResponse } from "@/types";
import { isValidStatus, validateCreateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder, statusFilter } from "@/models/Folder";
import { countItemsByFolder } from "@/lib/items";

/**
 * GET /api/folders?status=pending
 * My folders, newest first, optionally filtered by status.
 * → { folders, counts: { all, active, pending, completed } }
 * Counts are always for all my folders, so filter chips can show them.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const param = new URL(request.url).searchParams.get("status");
    let status: FolderStatus | null = null;
    if (param !== null) {
      if (!isValidStatus(param)) return jsonError(`status must be one of: ${STATUS_VALUES.join(", ")}`, 400);
      status = param;
    }

    await connectDB();
    const owner = user.id;
    const [folders, grouped] = await Promise.all([
      Folder.find({ owner, ...(status && statusFilter(status)) }).sort({ updatedAt: -1 }).lean(),
      Folder.aggregate<{ _id: string; n: number }>([
        // aggregate() skips Mongoose casting, so the id must be an ObjectId here.
        { $match: { owner: new mongoose.Types.ObjectId(owner) } },
        // Folders without a status count as the default one.
        { $group: { _id: { $ifNull: ["$status", DEFAULT_STATUS] }, n: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries([...STATUS_VALUES, "all"].map((s) => [s, 0])) as FolderCounts;
    for (const g of grouped) if (isFolderStatus(g._id)) counts[g._id] = g.n;
    counts.all = grouped.reduce((sum, g) => sum + g.n, 0);

    // Item progress for every folder card, in one query.
    const progress = await countItemsByFolder(folders.map((f) => f._id));
    const body: FolderListResponse = {
      folders: folders.map((f) => ({
        ...serializeFolder(f),
        ...(progress.get(String(f._id)) ?? { itemCount: 0, doneCount: 0 }),
      })),
      counts,
    };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders: { name, status? } → the new folder.
export async function POST(request: Request): Promise<Response> {
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

    const folder = await Folder.create({ ...result.value, owner: new mongoose.Types.ObjectId(user.id) });
    return Response.json(serializeFolder(folder), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

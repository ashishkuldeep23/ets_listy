import mongoose, { type Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OWNER_PERMISSIONS, sharedWithUser } from "@/lib/access";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_STATUS, STATUS_VALUES, isFolderStatus, type FolderStatus } from "@/lib/constants";
import type { FolderCounts, FolderListResponse, FolderPermissions, FolderScope } from "@/types";
import { isValidStatus, validateCreateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder, statusFilter } from "@/models/Folder";
import { countItemsByFolder } from "@/lib/items";

const SCOPES: readonly FolderScope[] = ["mine", "shared"];

const VIEW_ONLY: FolderPermissions = { role: "shared", canCheck: false, canEdit: false, canManage: false, sharedBy: null };

/**
 * GET /api/folders?scope=shared&status=pending
 * scope "mine" (default): folders I own. scope "shared": folders shared with me.
 * Newest first, optionally filtered by status.
 * → { folders, counts: { all, active, pending, completed } }
 * Each folder carries what I may do with it and its item progress.
 * Counts cover every folder in the scope, so filter chips can show them.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const params = new URL(request.url).searchParams;
    const scopeParam = params.get("scope") ?? "mine";
    if (!(SCOPES as readonly string[]).includes(scopeParam)) {
      return jsonError(`scope must be one of: ${SCOPES.join(", ")}`, 400);
    }
    const statusParam = params.get("status");
    let status: FolderStatus | null = null;
    if (statusParam !== null) {
      if (!isValidStatus(statusParam)) return jsonError(`status must be one of: ${STATUS_VALUES.join(", ")}`, 400);
      status = statusParam;
    }

    await connectDB();

    // Which folders are in scope, and what I may do with each.
    // aggregate() skips Mongoose casting, so ids must be ObjectIds in `scopeFilter`.
    let scopeFilter: { owner: Types.ObjectId } | { _id: { $in: Types.ObjectId[] } };
    let permsFor: (folderId: string) => FolderPermissions;
    if (scopeParam === "mine") {
      scopeFilter = { owner: new mongoose.Types.ObjectId(user.id) };
      permsFor = () => OWNER_PERMISSIONS;
    } else {
      const shared = await sharedWithUser(user.id);
      scopeFilter = { _id: { $in: [...shared.keys()].map((id) => new mongoose.Types.ObjectId(id)) } };
      // Every folder in this scope has a share; fall back to the least access just in case.
      permsFor = (id) => shared.get(id) ?? VIEW_ONLY;
    }

    const [folders, grouped] = await Promise.all([
      Folder.find({ ...scopeFilter, ...(status && statusFilter(status)) }).sort({ updatedAt: -1 }).lean(),
      Folder.aggregate<{ _id: string; n: number }>([
        { $match: scopeFilter },
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
        ...permsFor(String(f._id)),
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

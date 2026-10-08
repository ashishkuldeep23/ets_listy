import type { Types } from "mongoose";
import { Share, type IShare } from "@/models/Share";
import { User } from "@/models/User";
import type { ShareDTO } from "@/types";

// Helpers for the share routes.

type ShareDoc = IShare & { _id: Types.ObjectId };

/** Everyone a folder is shared with, oldest first, with their name and email (owner view). */
export async function listShares(folderId: Types.ObjectId): Promise<ShareDTO[]> {
  const shares = await Share.find({ folder: folderId }).sort({ createdAt: 1 }).lean<ShareDoc[]>();
  const users = await User.find({ _id: { $in: shares.map((s) => s.sharedWith) } })
    .select("name email")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return shares.flatMap((s) => {
    const u = byId.get(String(s.sharedWith));
    // A deleted account leaves nothing to show.
    if (!u) return [];
    return [
      {
        user: { id: String(u._id), name: u.name, email: u.email },
        canCheck: s.canCheck || s.canEdit,
        canEdit: s.canEdit,
        via: s.via,
      },
    ];
  });
}

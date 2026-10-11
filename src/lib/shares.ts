import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Folder } from "@/models/Folder";
import { Item, serializeItem, type ItemDoc } from "@/models/Item";
import { DEFAULT_STATUS } from "@/lib/constants";
import { Share, type IShare } from "@/models/Share";
import { User } from "@/models/User";
import { ShareLink, type IShareLink } from "@/models/ShareLink";
import type { PublicShareResponse, ShareDTO, ShareLinkDTO } from "@/types";

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

/** The share link as the owner sees it. The URL uses the origin the request came in on. */
export function serializeShareLink(link: IShareLink, origin: string): ShareLinkDTO {
  return {
    url: `${origin}/share/${link.token}`,
    canCheck: link.canCheck || link.canEdit,
    canEdit: link.canEdit,
    enabled: link.enabled,
  };
}

/** A folder's link for the owner view, or null if none was ever created. */
export async function getShareLink(folderId: Types.ObjectId, origin: string): Promise<ShareLinkDTO | null> {
  const link = await ShareLink.findOne({ folder: folderId }).lean();
  return link ? serializeShareLink(link, origin) : null;
}

/**
 * The public, read-only view behind a share link, or null if the token is
 * unknown, the link is off, or the list is gone. Check the token's shape
 * (isShareTokenShape) before calling.
 */
export async function getPublicShare(token: string): Promise<PublicShareResponse | null> {
  await connectDB();
  const link = await ShareLink.findOne({ token, enabled: true }).select("folder canCheck canEdit").lean();
  if (!link) return null;
  const folder = await Folder.findById(link.folder).select("name status").lean();
  if (!folder) return null;

  // doneBy is not populated and is cleared: anonymous visitors never see who ticked what.
  const items = await Item.find({ folder: folder._id }).sort({ position: 1 }).lean<ItemDoc[]>();
  return {
    list: { name: folder.name, status: folder.status ?? DEFAULT_STATUS },
    items: items.map((i) => ({ ...serializeItem(i), doneBy: null })),
    canCheck: link.canCheck || link.canEdit,
  };
}

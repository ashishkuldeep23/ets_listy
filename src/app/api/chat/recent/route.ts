import { requireUser } from "@/lib/auth";
import { noticeText } from "@/lib/chat";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { cleanAfter } from "@/lib/validators";
import { AUTHOR_NAME, ChatMessage, serializeChatMessage, type ChatMessageDoc } from "@/models/ChatMessage";
import { Folder } from "@/models/Folder";
import { Share } from "@/models/Share";
import type { ChatNoticeResponse } from "@/types";

// GET /api/chat/recent?after=ISO → { notices }: new messages by others in
// lists I own or that are shared with me. The toasts poll this only when
// live updates (Pusher) are off; with Pusher they arrive as events.

const MAX_NOTICES = 5;

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limit = rateLimit(`chat-recent:${user.id}`, { limit: 300 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const after = cleanAfter(new URL(request.url).searchParams.get("after"));
    if (!after) return jsonError("after must be a date", 400);

    const [owned, shares] = await Promise.all([
      Folder.find({ owner: user.id }).select("name").lean(),
      Share.find({ sharedWith: user.id }).select("folder").lean(),
    ]);
    const shared = await Folder.find({ _id: { $in: shares.map((s) => s.folder) } })
      .select("name")
      .lean();
    const names = new Map([...owned, ...shared].map((f) => [String(f._id), f.name]));

    const docs = await ChatMessage.find({
      folder: { $in: [...names.keys()] },
      createdAt: { $gt: after },
      authorKey: { $ne: `u:${user.id}` },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_NOTICES)
      .populate(AUTHOR_NAME)
      .lean<ChatMessageDoc[]>();

    const data: ChatNoticeResponse = {
      notices: docs.reverse().map((doc) => {
        const msg = serializeChatMessage(doc, null);
        return {
          id: msg.id,
          folderId: msg.folderId,
          folderName: names.get(msg.folderId) ?? "a list",
          authorName: msg.authorName,
          text: noticeText(msg.text),
          createdAt: msg.createdAt,
        };
      }),
    };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}

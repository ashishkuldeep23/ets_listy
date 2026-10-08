import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { FOLDER_CHANNEL_RE, USER_CHANNEL_RE } from "@/lib/channels";
import { getPusher } from "@/lib/realtime";
import { jsonError, serverError } from "@/lib/http";

// POST /api/pusher/auth: pusher-js asks here before subscribing to a
// private channel. Body is form-encoded: socket_id, channel_name.
//   private-folder-<id>: only users getFolderAccess() lets in
//   private-user-<id>:   only that user
// Anything else is refused, so nobody can listen to data they can't see.

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const pusher = getPusher();
    if (!pusher) return jsonError("Live updates are not configured", 503);

    const form = new URLSearchParams(await request.text());
    const socketId = form.get("socket_id") ?? "";
    const channel = form.get("channel_name") ?? "";
    if (!/^\d+\.\d+$/.test(socketId)) return jsonError("Bad socket id", 400);

    const folderMatch = FOLDER_CHANNEL_RE.exec(channel);
    const userMatch = USER_CHANNEL_RE.exec(channel);

    let allowed = false;
    if (folderMatch?.[1]) allowed = (await getFolderAccess(user.id, folderMatch[1])) !== null;
    else if (userMatch?.[1]) allowed = userMatch[1] === user.id;
    if (!allowed) return jsonError("Not allowed to listen to this channel", 403);

    return Response.json(pusher.authorizeChannel(socketId, channel));
  } catch (err) {
    return serverError(err);
  }
}

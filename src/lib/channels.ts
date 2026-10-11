// Pusher channel and event names, shared by the server and the browser so
// they can never drift apart. Only private channels are used: listening
// requires /api/pusher/auth to say yes.

export const folderChannel = (folderId: string) => `private-folder-${folderId}`;
export const userChannel = (userId: string) => `private-user-${userId}`;

/** Exact shapes the auth route accepts (24-hex Mongo ids only). */
export const FOLDER_CHANNEL_RE = /^private-folder-([a-f0-9]{24})$/;
export const USER_CHANNEL_RE = /^private-user-([a-f0-9]{24})$/;

/** Events sent on a folder channel / a user channel. */
export const EVENTS = {
  itemCreated: "item.created",
  itemUpdated: "item.updated",
  groupRenamed: "group.renamed",
  itemDeleted: "item.deleted",
  folderUpdated: "folder.updated",
  folderDeleted: "folder.deleted",
  accessChanged: "access.changed",
  folderProgress: "folder.progress",
  folderAccess: "folder.access",
  /** Folder channel: a new chat message (ChatMessageDTO). */
  chatMessage: "chat.message",
  /** User channel: someone wrote in a list I'm in (ChatNoticeEvent), for the toast. */
  chatNotice: "chat.notice",
} as const;

/** Header the browser sends with writes, so the sender doesn't get its own event back. */
export const SOCKET_ID_HEADER = "x-pusher-socket-id";

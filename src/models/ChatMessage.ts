import mongoose, { type Model, type Types } from "mongoose";
import { LIMITS } from "@/lib/limits";
import type { ChatMessageDTO } from "@/types";

// One message in a list's chat. Written by a member (author set) or by a
// guest on the share link (guestName set). `authorKey` says who wrote it
// ("u:<userId>" or "g:<hash of guest id>") so each reader can be told which
// messages are theirs; it is never sent to clients.

export interface IChatMessage {
  folder: Types.ObjectId;
  author?: Types.ObjectId;
  guestName?: string;
  authorKey: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new mongoose.Schema<IChatMessage>(
  {
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    guestName: { type: String, maxlength: 40 },
    authorKey: { type: String, required: true, maxlength: 80 },
    text: { type: String, required: true, maxlength: LIMITS.CHAT_MESSAGE_MAX },
  },
  { timestamps: true }
);

chatMessageSchema.index({ folder: 1, createdAt: -1 });

export const ChatMessage: Model<IChatMessage> =
  (mongoose.models.ChatMessage as Model<IChatMessage> | undefined) ??
  mongoose.model<IChatMessage>("ChatMessage", chatMessageSchema);

/** A message as read from the DB, with `author` optionally populated to { _id, name }. */
export type ChatMessageDoc = Omit<IChatMessage, "author"> & {
  _id: Types.ObjectId;
  author?: Types.ObjectId | { _id: Types.ObjectId; name: string } | null;
};

/** Populate options that load only the author's name (never the email). */
export const AUTHOR_NAME = { path: "author", select: "name" } as const;

/** The shape sent to clients. `viewerKey` marks the reader's own messages. */
export function serializeChatMessage(msg: ChatMessageDoc, viewerKey: string | null): ChatMessageDTO {
  const author = msg.author && "name" in msg.author ? msg.author : null;
  return {
    id: String(msg._id),
    folderId: String(msg.folder),
    text: msg.text,
    // A deleted account leaves its messages behind without a name.
    authorName: author?.name ?? msg.guestName ?? "Someone",
    authorId: author ? String(author._id) : msg.author ? String(msg.author) : null,
    mine: viewerKey !== null && msg.authorKey === viewerKey,
    createdAt: msg.createdAt,
  };
}

import { getFolderAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { jsonError, readJson, serverError } from "@/lib/http";
import { validateReminder } from "@/lib/pushValidators";
import { Reminder, serializeReminder } from "@/models/Reminder";
import type { ReminderResponse } from "@/types";

type Ctx = RouteContext<"/api/folders/[id]/reminder">;

// My own reminder for a list. Anyone who can see the list may set one, even
// view-only; other members can't see it.

const NOT_FOUND = "List not found";

// GET /api/folders/:id/reminder
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    const reminder = await Reminder.findOne({ user: user.id, folder: access.folder._id }).lean();
    const body: ReminderResponse = { reminder: reminder && serializeReminder(reminder) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// PUT /api/folders/:id/reminder: { remindAt } (ISO date). Replaces any earlier one.
export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateReminder(body);
    if (!result.ok) return jsonError(result.error, 400);

    const reminder = await Reminder.findOneAndUpdate(
      { user: user.id, folder: access.folder._id },
      { $set: { remindAt: result.value.remindAt, sentAt: null } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    const response: ReminderResponse = { reminder: reminder && serializeReminder(reminder) };
    return Response.json(response);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/folders/:id/reminder
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    await Reminder.deleteOne({ user: user.id, folder: access.folder._id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

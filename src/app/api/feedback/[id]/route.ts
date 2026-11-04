import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";
import { jsonError, readJson, serverError } from "@/lib/http";
import { validateFeedback } from "@/lib/validators";
import { Feedback, NOT_DELETED, serializeFeedback } from "@/models/Feedback";

type Ctx = RouteContext<"/api/feedback/[id]">;

// Only the author can change their feedback. Someone else's, or a deleted one,
// answers 404, like one that doesn't exist.

const NOT_FOUND = "Feedback not found";

// PATCH /api/feedback/:id: { message, name?, rating? }
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return jsonError(NOT_FOUND, 404);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateFeedback(body);
    if (!result.ok) return jsonError(result.error, 400);

    const updated = await Feedback.findOneAndUpdate(
      { _id: id, user: user.id, ...NOT_DELETED },
      { $set: result.value },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!updated) return jsonError(NOT_FOUND, 404);
    return Response.json(serializeFeedback(updated, user.id));
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/feedback/:id: hides it for good, but keeps the row (soft delete).
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return jsonError(NOT_FOUND, 404);

    const { matchedCount } = await Feedback.updateOne(
      { _id: id, user: user.id, ...NOT_DELETED },
      { $set: { deletedAt: new Date() } }
    );
    if (matchedCount === 0) return jsonError(NOT_FOUND, 404);
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

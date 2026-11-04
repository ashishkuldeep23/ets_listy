import { requireUser } from "@/lib/auth";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { rateLimit } from "@/lib/rateLimit";
import { validateFeedback } from "@/lib/validators";
import { Feedback, NOT_DELETED, serializeFeedback } from "@/models/Feedback";
import type { FeedbackListResponse } from "@/types";

// GET /api/feedback: everyone's feedback, newest first (any logged-in user).
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const rows = await Feedback.find(NOT_DELETED).sort({ createdAt: -1 }).limit(LIMITS.FEEDBACK_LIST).lean();
    const body: FeedbackListResponse = { feedback: rows.map((row) => serializeFeedback(row, user.id)) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/feedback: { message, name?, rating? }
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    // Everyone sees this page, so one account mustn't be able to flood it.
    const limit = rateLimit(`feedback:${user.id}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateFeedback(body);
    if (!result.ok) return jsonError(result.error, 400);

    const feedback = await Feedback.create({ ...result.value, user: user.id });
    return Response.json(serializeFeedback(feedback.toObject(), user.id), { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { jsonError, readJson, serverError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { validatePushEndpoint, validatePushSubscription } from "@/lib/pushValidators";
import { PushSubscription } from "@/models/PushSubscription";

// POST /api/push/subscription: { endpoint, keys: { p256dh, auth } } → this device gets my notifications.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validatePushSubscription(body);
    if (!result.ok) return jsonError(result.error, 400);

    await connectDB();
    const { endpoint, p256dh, auth } = result.value;
    await PushSubscription.updateOne({ endpoint }, { $set: { user: user.id, p256dh, auth } }, { upsert: true });

    // Old devices stop answering without saying so: keep only my most recent ones.
    const extra = await PushSubscription.find({ user: user.id })
      .sort({ updatedAt: -1 })
      .skip(LIMITS.PUSH_DEVICES_PER_USER)
      .select("_id")
      .lean();
    if (extra.length > 0) await PushSubscription.deleteMany({ _id: { $in: extra.map((s) => s._id) } });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/push/subscription: { endpoint } → stop notifying this device (on logout).
export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validatePushEndpoint(body);
    if (!result.ok) return jsonError(result.error, 400);

    await connectDB();
    // Scoped to me: knowing an endpoint isn't enough to remove someone else's device.
    await PushSubscription.deleteOne({ endpoint: result.value.endpoint, user: user.id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}

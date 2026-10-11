import { requireUser } from "@/lib/auth";
import { jsonError, readJson, serverError } from "@/lib/http";
import { validateProfileUpdate } from "@/lib/validators";
import { User } from "@/models/User";
import type { SessionUser } from "@/types";

// GET   /api/auth/me: the logged-in user, or 401.
// PATCH /api/auth/me { name }: change my name. The email can't be changed.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return Response.json(user);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateProfileUpdate(body);
    if (!result.ok) return jsonError(result.error, 400);

    const updated = await User.findByIdAndUpdate(user.id, { $set: { name: result.value.name } }, { returnDocument: "after" }).lean();
    if (!updated) return jsonError("Please log in", 401);
    const data: SessionUser = { id: String(updated._id), name: updated.name, email: updated.email };
    return Response.json(data);
  } catch (err) {
    return serverError(err);
  }
}

import { requireUser } from "@/lib/auth";
import { serverError } from "@/lib/http";

// GET /api/auth/me: the logged-in user, or 401.
export async function GET(request) {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return Response.json(user);
  } catch (err) {
    return serverError(err);
  }
}

import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { escapeRegex } from "@/lib/savedItems";
import { LIMITS } from "@/lib/limits";
import { rateLimit } from "@/lib/rateLimit";
import { cleanSearchQuery } from "@/lib/validators";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { User } from "@/models/User";
import type { UserSearchResponse } from "@/types";

// GET /api/users/search?q=ash → { users } (id, name, email), for the
// "Invite a person" box. Logged-in users only, never includes me.
// Matches the START of an email or of a word in a name (not anywhere), needs
// a few characters and returns only a handful, so it can't list everyone.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    // Typing sends one request per pause, so allow plenty, but stop scrapers.
    const limit = rateLimit(`user-search:${user.id}`, { limit: 300 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const q = cleanSearchQuery(new URL(request.url).searchParams.get("q"));
    const empty: UserSearchResponse = { users: [] };
    if (!q || q.length < LIMITS.USER_SEARCH_MIN) return Response.json(empty);
    if (q.length > LIMITS.EMAIL_MAX) return jsonError("Search is too long", 400);

    const text = escapeRegex(q);
    await connectDB();
    const users = await User.find({
      _id: { $ne: user.id },
      $or: [
        // Emails are stored lower-case; an anchored regex can use the email index.
        { email: { $regex: `^${escapeRegex(q.toLowerCase())}` } },
        { name: { $regex: `(^|\\s)${text}`, $options: "i" } },
      ],
    })
      .select("name email")
      .sort({ name: 1 })
      .limit(LIMITS.USER_SEARCH_RESULTS)
      .lean();

    const body: UserSearchResponse = {
      users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })),
    };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

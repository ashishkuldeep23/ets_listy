import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

// POST /api/auth/logout: clears the session cookie. POST (not GET) so a
// link or image on another site can't log the user out.
export async function POST(): Promise<Response> {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}

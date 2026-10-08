import { LIMITS } from "@/lib/limits";
import { STATUS_VALUES } from "@/lib/constants";

// Plain validators for request bodies. Each returns either
// { ok: true, value } with ONLY the allowed fields, or { ok: false, error }.
// Picking fields explicitly (never spreading the body) stops clients from
// writing fields we did not intend, and type checks block operator
// objects like { "$gt": "" } (NoSQL injection).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function cleanName(name) {
  if (typeof name !== "string") return { error: "name must be a string" };
  const n = name.trim();
  if (!n) return { error: "name is required" };
  if (n.length > LIMITS.USER_NAME_MAX) return { error: `name must be at most ${LIMITS.USER_NAME_MAX} characters` };
  return { value: n };
}

function cleanEmail(email) {
  if (typeof email !== "string") return { error: "email must be a string" };
  const e = email.trim().toLowerCase();
  if (!e) return { error: "email is required" };
  if (e.length > LIMITS.EMAIL_MAX || !EMAIL_RE.test(e)) return { error: "email is not valid" };
  return { value: e };
}

// Passwords are not trimmed: spaces are allowed characters.
function cleanPassword(password) {
  if (typeof password !== "string") return { error: "password must be a string" };
  if (password.length < LIMITS.PASSWORD_MIN) {
    return { error: `password must be at least ${LIMITS.PASSWORD_MIN} characters` };
  }
  if (Buffer.byteLength(password, "utf8") > LIMITS.PASSWORD_MAX_BYTES) {
    return { error: "password is too long" };
  }
  return { value: password };
}

/** Body for POST /api/auth/signup: { name, email, password }. */
export function validateSignup(body) {
  if (!isPlainObject(body)) return { ok: false, error: "body must be a JSON object" };

  for (const [field, clean] of [["name", cleanName], ["email", cleanEmail], ["password", cleanPassword]]) {
    const r = clean(body[field]);
    if (r.error) return { ok: false, error: r.error };
  }
  return {
    ok: true,
    value: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
    },
  };
}

/**
 * Body for POST /api/auth/login: { email, password }.
 * Only type/presence checks here: length rules would hint at which
 * passwords can exist, and a wrong password just fails the login.
 */
export function validateLogin(body) {
  if (!isPlainObject(body)) return { ok: false, error: "body must be a JSON object" };
  if (typeof body.email !== "string" || !body.email.trim()) return { ok: false, error: "email is required" };
  if (typeof body.password !== "string" || !body.password) return { ok: false, error: "password is required" };
  if (body.email.length > LIMITS.EMAIL_MAX || Buffer.byteLength(body.password, "utf8") > LIMITS.PASSWORD_MAX_BYTES) {
    return { ok: false, error: "Invalid email or password" };
  }
  return { ok: true, value: { email: body.email.trim().toLowerCase(), password: body.password } };
}

function cleanFolderName(name) {
  if (typeof name !== "string") return { error: "name must be a string" };
  const n = name.trim();
  if (!n) return { error: "name is required" };
  if (n.length > LIMITS.FOLDER_NAME_MAX) return { error: `name must be at most ${LIMITS.FOLDER_NAME_MAX} characters` };
  return { value: n };
}

/** True for a known folder status. Also used for the ?status= query param. */
export function isValidStatus(status) {
  return typeof status === "string" && STATUS_VALUES.includes(status);
}

const STATUS_ERROR = `status must be one of: ${STATUS_VALUES.join(", ")}`;

/** Body for POST /api/folders: { name, status? }. */
export function validateCreateFolder(body) {
  if (!isPlainObject(body)) return { ok: false, error: "body must be a JSON object" };
  const name = cleanFolderName(body.name);
  if (name.error) return { ok: false, error: name.error };
  const value = { name: name.value };
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) return { ok: false, error: STATUS_ERROR };
    value.status = body.status;
  }
  return { ok: true, value };
}

/** Body for PATCH /api/folders/:id: { name?, status? }, at least one field. */
export function validateUpdateFolder(body) {
  if (!isPlainObject(body)) return { ok: false, error: "body must be a JSON object" };
  const value = {};
  if (body.name !== undefined) {
    const name = cleanFolderName(body.name);
    if (name.error) return { ok: false, error: name.error };
    value.name = name.value;
  }
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) return { ok: false, error: STATUS_ERROR };
    value.status = body.status;
  }
  if (Object.keys(value).length === 0) return { ok: false, error: "nothing to update" };
  return { ok: true, value };
}

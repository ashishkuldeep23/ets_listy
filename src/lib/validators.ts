import { LIMITS } from "@/lib/limits";
import { STATUS_VALUES, isFolderStatus, type FolderStatus } from "@/lib/constants";
import type { Result } from "@/types";

// Plain validators for request bodies. Each takes `unknown` (whatever the
// client sent) and returns either { ok: true, value } with ONLY the allowed
// fields, or { ok: false, error }. Picking fields explicitly (never
// spreading the body) stops clients from writing fields we did not intend,
// and type checks block operator objects like { "$gt": "" } (NoSQL injection).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = Record<string, unknown>;
type Clean<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

function isPlainObject(v: unknown): v is Body {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function cleanName(name: unknown): Clean<string> {
  if (typeof name !== "string") return { error: "name must be a string" };
  const n = name.trim();
  if (!n) return { error: "name is required" };
  if (n.length > LIMITS.USER_NAME_MAX) return { error: `name must be at most ${LIMITS.USER_NAME_MAX} characters` };
  return { value: n };
}

function cleanEmail(email: unknown): Clean<string> {
  if (typeof email !== "string") return { error: "email must be a string" };
  const e = email.trim().toLowerCase();
  if (!e) return { error: "email is required" };
  if (e.length > LIMITS.EMAIL_MAX || !EMAIL_RE.test(e)) return { error: "email is not valid" };
  return { value: e };
}

// Passwords are not trimmed: spaces are allowed characters.
function cleanPassword(password: unknown): Clean<string> {
  if (typeof password !== "string") return { error: "password must be a string" };
  if (password.length < LIMITS.PASSWORD_MIN) {
    return { error: `password must be at least ${LIMITS.PASSWORD_MIN} characters` };
  }
  if (Buffer.byteLength(password, "utf8") > LIMITS.PASSWORD_MAX_BYTES) {
    return { error: "password is too long" };
  }
  return { value: password };
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

/** Body for POST /api/auth/signup: { name, email, password }. */
export function validateSignup(body: unknown): Result<SignupInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");

  const name = cleanName(body.name);
  if (name.error !== undefined) return fail(name.error);
  const email = cleanEmail(body.email);
  if (email.error !== undefined) return fail(email.error);
  const password = cleanPassword(body.password);
  if (password.error !== undefined) return fail(password.error);

  return { ok: true, value: { name: name.value, email: email.value, password: password.value } };
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Same message as a wrong password, so over-long input reveals nothing. */
export const INVALID_LOGIN = "Invalid email or password";

/**
 * Body for POST /api/auth/login: { email, password }.
 * Only type/presence checks here: length rules would hint at which
 * passwords can exist, and a wrong password just fails the login.
 */
export function validateLogin(body: unknown): Result<LoginInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");
  const { email, password } = body;
  if (typeof email !== "string" || !email.trim()) return fail("email is required");
  if (typeof password !== "string" || !password) return fail("password is required");
  if (email.length > LIMITS.EMAIL_MAX || Buffer.byteLength(password, "utf8") > LIMITS.PASSWORD_MAX_BYTES) {
    return fail(INVALID_LOGIN);
  }
  return { ok: true, value: { email: email.trim().toLowerCase(), password } };
}

function cleanFolderName(name: unknown): Clean<string> {
  if (typeof name !== "string") return { error: "name must be a string" };
  const n = name.trim();
  if (!n) return { error: "name is required" };
  if (n.length > LIMITS.FOLDER_NAME_MAX) return { error: `name must be at most ${LIMITS.FOLDER_NAME_MAX} characters` };
  return { value: n };
}

/** True for a known folder status. Also used for the ?status= query param. */
export const isValidStatus = isFolderStatus;

const STATUS_ERROR = `status must be one of: ${STATUS_VALUES.join(", ")}`;

export interface CreateFolderInput {
  name: string;
  status?: FolderStatus;
}

/** Body for POST /api/folders: { name, status? }. */
export function validateCreateFolder(body: unknown): Result<CreateFolderInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");
  const name = cleanFolderName(body.name);
  if (name.error !== undefined) return fail(name.error);

  const value: CreateFolderInput = { name: name.value };
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) return fail(STATUS_ERROR);
    value.status = body.status;
  }
  return { ok: true, value };
}

export type UpdateFolderInput = Partial<CreateFolderInput>;

/** Body for PATCH /api/folders/:id: { name?, status? }, at least one field. */
export function validateUpdateFolder(body: unknown): Result<UpdateFolderInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");

  const value: UpdateFolderInput = {};
  if (body.name !== undefined) {
    const name = cleanFolderName(body.name);
    if (name.error !== undefined) return fail(name.error);
    value.name = name.value;
  }
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) return fail(STATUS_ERROR);
    value.status = body.status;
  }
  if (Object.keys(value).length === 0) return fail("nothing to update");
  return { ok: true, value };
}

/* ---------- items ---------- */

/**
 * Optional text field: undefined = not sent, null or "" = clear it,
 * otherwise a trimmed string within `max`.
 */
function cleanOptionalText(v: unknown, field: string, max: number): Clean<string | null | undefined> {
  if (v === undefined) return { value: undefined };
  if (v === null) return { value: null };
  if (typeof v !== "string") return { error: `${field} must be a string` };
  const t = v.trim();
  if (t.length > max) return { error: `${field} must be at most ${max} characters` };
  return { value: t || null };
}

/** Price in rupees: undefined = not sent, null = clear, else a real number 0..max. */
function cleanPrice(v: unknown): Clean<number | null | undefined> {
  if (v === undefined) return { value: undefined };
  if (v === null) return { value: null };
  // typeof check rejects "12"; isFinite rejects NaN and Infinity.
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITS.ITEM_PRICE_MAX) {
    return { error: `price must be a number from 0 to ${LIMITS.ITEM_PRICE_MAX}` };
  }
  return { value: Math.round(v * 100) / 100 }; // keep paise, drop float noise
}

function cleanItemName(name: unknown): Clean<string> {
  if (typeof name !== "string") return { error: "name must be a string" };
  const n = name.trim();
  if (!n) return { error: "name is required" };
  if (n.length > LIMITS.ITEM_NAME_MAX) return { error: `name must be at most ${LIMITS.ITEM_NAME_MAX} characters` };
  return { value: n };
}

/** Item fields that can be changed. null means "clear this field". */
export interface ItemFieldsInput {
  name?: string;
  category?: string | null;
  price?: number | null;
  description?: string | null;
}

/** Reads the optional item fields from `body` into `out`; returns an error message or null. */
function readOptionalItemFields(body: Body, out: ItemFieldsInput): string | null {
  const category = cleanOptionalText(body.category, "category", LIMITS.ITEM_CATEGORY_MAX);
  if (category.error !== undefined) return category.error;
  const price = cleanPrice(body.price);
  if (price.error !== undefined) return price.error;
  const description = cleanOptionalText(body.description, "description", LIMITS.ITEM_DESCRIPTION_MAX);
  if (description.error !== undefined) return description.error;

  if (category.value !== undefined) out.category = category.value;
  if (price.value !== undefined) out.price = price.value;
  if (description.value !== undefined) out.description = description.value;
  return null;
}

export interface CreateItemInput extends ItemFieldsInput {
  name: string;
}

/** Body for POST /api/folders/:id/items: { name, category?, price?, description? }. */
export function validateCreateItem(body: unknown): Result<CreateItemInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");
  const name = cleanItemName(body.name);
  if (name.error !== undefined) return fail(name.error);

  const value: CreateItemInput = { name: name.value };
  const error = readOptionalItemFields(body, value);
  if (error) return fail(error);
  return { ok: true, value };
}

/** Body for PATCH /api/folders/:id/items/:itemId: any item field, at least one. */
export function validateUpdateItem(body: unknown): Result<ItemFieldsInput> {
  if (!isPlainObject(body)) return fail("body must be a JSON object");

  const value: ItemFieldsInput = {};
  if (body.name !== undefined) {
    const name = cleanItemName(body.name);
    if (name.error !== undefined) return fail(name.error);
    value.name = name.value;
  }
  const error = readOptionalItemFields(body, value);
  if (error) return fail(error);
  if (Object.keys(value).length === 0) return fail("nothing to update");
  return { ok: true, value };
}

/** Body for POST /api/folders/:id/items/:itemId/toggle: { done: boolean }. */
export function validateToggle(body: unknown): Result<{ done: boolean }> {
  if (!isPlainObject(body) || typeof body.done !== "boolean") return fail("done must be true or false");
  return { ok: true, value: { done: body.done } };
}

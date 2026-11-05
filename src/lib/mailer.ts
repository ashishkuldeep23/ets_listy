import nodemailer, { type Transporter } from "nodemailer";
import { LIMITS } from "@/lib/limits";

// Sends email through a Gmail account (USER_EMAIL + a Gmail App Password in
// USER_PASS). Server only: USER_PASS must never reach the browser.

const TIMEOUT_MS = 10_000;

export const isMailConfigured = (): boolean => Boolean(process.env.USER_EMAIL && process.env.USER_PASS);

/**
 * The site's address for links in emails. Comes from APP_URL, not the request:
 * anyone can send a fake Host header, and we'd then email a real person a link
 * to the attacker's site. Only local development may fall back on the request.
 */
export function appBaseUrl(request: Request): string | null {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  }
  return process.env.NODE_ENV === "production" ? null : new URL(request.url).origin;
}

let transport: Transporter | undefined;
let transportLogin = "";

function getTransport(): Transporter {
  // Made again when the login changes: a corrected password must work without a restart.
  const login = `${process.env.USER_EMAIL}:${process.env.USER_PASS}`;
  if (!transport || login !== transportLogin) {
    transportLogin = login;
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.USER_EMAIL, pass: process.env.USER_PASS },
      // Signup waits for this: a stuck mail server must not hold the request open.
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
  return transport;
}

/** The email itself. Holds no text typed by the signer-up, so it can't be used to spam others with their words. */
export function activationMail(to: string, url: string) {
  const hours = LIMITS.ACTIVATION_LINK_HOURS;
  return {
    from: `Listy <${process.env.USER_EMAIL}>`,
    to,
    subject: "Activate your Listy account",
    text: [
      "Open this link to activate your Listy account and log in:",
      "",
      url,
      "",
      `The link works once and expires in ${hours} hours.`,
      "",
      "Didn't sign up for Listy? Don't open the link. Someone may have typed your email by mistake. Without the link, no account is made.",
    ].join("\n"),
    // The token is URL-safe and the origin comes from our own settings, so nothing here needs escaping.
    html: `<p>Open this link to activate your Listy account and log in:</p>
<p><a href="${url}">Activate my account</a></p>
<p>The link works once and expires in ${hours} hours.</p>
<p><strong>Didn't sign up for Listy?</strong> Don't open the link. Someone may have typed your email by mistake. Without the link, no account is made.</p>`,
  };
}

/** Returns whether the email was handed to Gmail. Never throws. */
export async function sendActivationEmail(to: string, url: string): Promise<boolean> {
  try {
    await getTransport().sendMail(activationMail(to, url));
    return true;
  } catch (err) {
    // The code only: the whole error can hold the mail's contents, and so the link.
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : "unknown";
    console.error("Activation email failed", code);
    return false;
  }
}

/** For tests: forget the transport so a mocked module or new env takes effect. */
export function resetMailerForTests(): void {
  transport = undefined;
}

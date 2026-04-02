import { setCurrentUserId } from "~/lib/session";

/**
 * Extracts the cookie name=value from a Set-Cookie header string.
 */
export function parseCookieFromSetCookie(setCookie: string): string {
  return setCookie.split(";")[0];
}

/**
 * Creates a Request with a valid session cookie for the given user.
 */
export async function createAuthenticatedRequest(
  userId: number,
  url: string,
  options: RequestInit = {}
): Promise<Request> {
  const dummyRequest = new Request(url);
  const setCookieHeader = await setCurrentUserId(dummyRequest, userId);

  const headers = new Headers(options.headers);
  headers.set("Cookie", parseCookieFromSetCookie(setCookieHeader));

  return new Request(url, { ...options, headers });
}

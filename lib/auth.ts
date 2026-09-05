import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

export const AUTH_TOKEN_COOKIE = "auth-token";
export const AUTH_TOKEN_ORIGINAL_COOKIE = "auth-token-original";

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(jwtSecret);
}

export interface JWTPayload {
  userId: string;
  role: string;
  schoolId: string | null;
  accessLevel: string;
  [key: string]: unknown;
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getTokenFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  const token = req.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getAuthCookieOptions(maxAge: number = AUTH_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export function setAuthTokenCookie(response: NextResponse, token: string): void {
  response.cookies.set(AUTH_TOKEN_COOKIE, token, getAuthCookieOptions());
}

export function setAuthTokenOriginalCookie(response: NextResponse, token: string): void {
  response.cookies.set(AUTH_TOKEN_ORIGINAL_COOKIE, token, getAuthCookieOptions());
}

export function clearAuthTokenCookie(response: NextResponse): void {
  response.cookies.set(AUTH_TOKEN_COOKIE, "", { ...getAuthCookieOptions(0), maxAge: 0 });
}

export function clearAuthTokenOriginalCookie(response: NextResponse): void {
  response.cookies.set(AUTH_TOKEN_ORIGINAL_COOKIE, "", {
    ...getAuthCookieOptions(0),
    maxAge: 0,
  });
}

export function clearAllAuthCookies(response: NextResponse): void {
  clearAuthTokenCookie(response);
  clearAuthTokenOriginalCookie(response);
}

export async function getOriginalTokenFromRequest(
  req: NextRequest
): Promise<JWTPayload | null> {
  const token = req.cookies.get(AUTH_TOKEN_ORIGINAL_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getRawAuthToken(req: NextRequest): string | null {
  return req.cookies.get(AUTH_TOKEN_COOKIE)?.value ?? null;
}

export function getRawOriginalAuthToken(req: NextRequest): string | null {
  return req.cookies.get(AUTH_TOKEN_ORIGINAL_COOKIE)?.value ?? null;
}

export function isImpersonating(req: NextRequest): boolean {
  return Boolean(req.cookies.get(AUTH_TOKEN_ORIGINAL_COOKIE)?.value);
}

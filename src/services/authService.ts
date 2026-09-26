/**
 * Google Drive Authentication & Token Management
 * Integrates with Google OAuth scopes:
 * - https://www.googleapis.com/auth/drive.file
 * - https://www.googleapis.com/auth/drive.metadata.readonly
 * - https://www.googleapis.com/auth/userinfo.profile
 * - https://www.googleapis.com/auth/userinfo.email
 * 
 * Supports browser-based Google Identity token client / popup authorization,
 * keeping the access token securely in-memory.
 */

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let inMemoryToken: string | null = null;
let tokenExpiresAt: number = 0;

export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: {
    email?: string;
    name?: string;
    picture?: string;
  } | null;
}

type AuthCallback = (state: AuthState) => void;
const listeners = new Set<AuthCallback>();

export function getCachedToken(): string | null {
  if (inMemoryToken && Date.now() < tokenExpiresAt) {
    return inMemoryToken;
  }
  return inMemoryToken; // return even if near expiry, will refresh on 401
}

export function subscribeAuth(cb: AuthCallback) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners(state: AuthState) {
  listeners.forEach((cb) => cb(state));
}

/**
 * Sets user token manually (e.g. from Google GIS or manual OAuth token)
 */
export function setAccessToken(token: string | null, expiresInSeconds: number = 3599, userProfile: any = null) {
  inMemoryToken = token;
  tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

  notifyListeners({
    isAuthenticated: Boolean(token),
    accessToken: token,
    user: userProfile,
  });
}

/**
 * Clears cached access token
 */
export function clearAuth() {
  inMemoryToken = null;
  tokenExpiresAt = 0;
  notifyListeners({
    isAuthenticated: false,
    accessToken: null,
    user: null,
  });
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

export interface GmailSession {
  tokens: GoogleTokens;
  emailAddress?: string;
  connectedAt: string;
  lastSyncAt?: string;
}

export const COOKIE_GMAIL_SESSION = 'gmail_session';
export const COOKIE_GMAIL_OAUTH_STATE = 'gmail_oauth_state';
export const DEFAULT_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const DEFAULT_GMAIL_SEARCH = 'label:"Synpath Sage Demo" has:attachment';

export const GOOGLE_REQUIRED_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_TOKEN_ENCRYPTION_KEY',
] as const;

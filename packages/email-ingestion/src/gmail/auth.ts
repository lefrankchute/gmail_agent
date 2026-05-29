import { google, Auth } from 'googleapis';

export function createOAuth2Client(
  clientId = process.env.GMAIL_CLIENT_ID!,
  clientSecret = process.env.GMAIL_CLIENT_SECRET!,
  redirectUri = process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:3001/auth/callback'
): Auth.OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthenticatedClient(): Auth.OAuth2Client {
  const auth = createOAuth2Client();
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });
  return auth;
}

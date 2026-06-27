// Google Drive plain-text transcript fetch by file id, using the same
// service-account credentials the search route already expects.
import { GoogleAuth } from 'google-auth-library';

let _token = null, _exp = 0;
export async function getAccessToken() {
  if (_token && Date.now() < _exp) return _token;
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  _token = token; _exp = Date.now() + 50 * 60 * 1000; // ~50 min
  return token;
}

export async function readTranscript(driveId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive read ${driveId}: ${res.status}`);
  return res.text();
}

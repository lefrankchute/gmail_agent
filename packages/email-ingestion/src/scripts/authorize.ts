/**
 * One-time script to generate Gmail OAuth2 refresh token.
 * Run: pnpm --filter @gmail-agent/email-ingestion authorize
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import { createOAuth2Client } from '../gmail/auth';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const PORT = 3001;

async function main() {
  let clientId = process.env.GMAIL_CLIENT_ID;
  let clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const credPath =
      process.env.GOOGLE_CREDENTIALS_PATH ?? resolve(process.cwd(), 'credentials.json');
    try {
      const creds = JSON.parse(readFileSync(credPath, 'utf-8')) as {
        installed?: { client_id: string; client_secret: string };
        web?: { client_id: string; client_secret: string };
      };
      const app = creds.installed ?? creds.web;
      if (!app) throw new Error('Formato de credentials.json inválido');
      clientId = app.client_id;
      clientSecret = app.client_secret;
      console.log('Credenciales leídas desde', credPath);
    } catch (err) {
      console.error(
        'Error: define GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en .env, o coloca credentials.json en la raíz del proyecto.'
      );
      console.error((err as Error).message);
      process.exit(1);
    }
  }

  const redirectUri = `http://localhost:${PORT}/auth/callback`;
  const auth = createOAuth2Client(clientId, clientSecret, redirectUri);

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token to be returned
  });

  console.log('\n🔐 Autorización OAuth2 para Gmail\n');
  console.log('Abre esta URL en el navegador:\n');
  console.log(authUrl);
  console.log(`\nEsperando callback en http://localhost:${PORT}/auth/callback ...\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Error: ${error}</h2><p>Puedes cerrar esta pestaña.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (!code) return;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<h2>Autorización exitosa.</h2><p>Puedes cerrar esta pestaña y volver a la terminal.</p>'
      );
      server.close();
      resolve(code);
    });

    server.listen(PORT);
    server.on('error', reject);
  });

  const { tokens } = await auth.getToken(code);

  console.log('\n✅ Autorización exitosa!\n');
  console.log('Agrega estas líneas a tu archivo .env:\n');
  console.log(`GMAIL_CLIENT_ID=${clientId}`);
  console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
  console.log(`GMAIL_REDIRECT_URI=${redirectUri}`);
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('');
}

main().catch(err => {
  console.error('Error en el proceso de autorización:', err);
  process.exit(1);
});

// One-time Spotify authorization: obtains the refresh token used by
// scripts/sync-now.mjs.
//
//   1. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (in .env)
//   2. In the Spotify dashboard, add this Redirect URI to your app:
//          http://127.0.0.1:8888/callback
//   3. npm run spotify-auth   → open the printed URL, approve
//   4. The refresh token is written to .env automatically.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const id = process.env.SPOTIFY_CLIENT_ID;
const secret = process.env.SPOTIFY_CLIENT_SECRET;
if (!id || !secret) {
    console.error(
        "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first (put them in .env, then run `npm run spotify-auth`).",
    );
    process.exit(1);
}

const PORT = 8888;
const redirectUri = `http://127.0.0.1:${PORT}/callback`;
const scope = "user-read-currently-playing user-read-recently-played";

const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
        client_id: id,
        response_type: "code",
        redirect_uri: redirectUri,
        scope,
    });

console.log(`
Make sure this Redirect URI is saved on your Spotify app:
    ${redirectUri}

Open this URL and approve access:
    ${authUrl}
`);

function saveRefreshToken(token) {
    let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const line = `SPOTIFY_REFRESH_TOKEN=${token}`;
    if (/^SPOTIFY_REFRESH_TOKEN=/m.test(env)) {
        env = env.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, line);
    } else {
        env = env.trimEnd() + (env ? "\n" : "") + line + "\n";
    }
    writeFileSync(envPath, env);
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/plain" });

    if (error || !code) {
        res.end(`Spotify returned: ${error ?? "no code"}. Check the terminal.`);
        console.error(`✗ authorization failed: ${error ?? "no code"}`);
        server.close();
        return;
    }

    try {
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                authorization: `Basic ${basic}`,
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
            }),
        });
        const body = await tokenRes.json();
        if (!tokenRes.ok || !body.refresh_token)
            throw new Error(JSON.stringify(body));

        saveRefreshToken(body.refresh_token);
        res.end("Done - the refresh token is in .env. You can close this tab.");
        console.log(
            "\n✔ refresh token written to .env - now run `npm run sync-now`",
        );
    } catch (err) {
        res.end("Token exchange failed. Check the terminal.");
        console.error("✗ token exchange failed:", err.message);
    }
    server.close();
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Waiting for the callback on ${redirectUri} …`);
});

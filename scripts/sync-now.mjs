// Refresh the "now" snapshots (src/data/reading.json, src/data/spotify.json).
//
//   HARDCOVER_TOKEN            Hardcover API token (settings → Hardcover API)
//   SPOTIFY_CLIENT_ID          Spotify app client id
//   SPOTIFY_CLIENT_SECRET      Spotify app client secret
//   SPOTIFY_REFRESH_TOKEN      from `npm run spotify-auth`
//
// Reads them from the environment (use `npm run sync-now`, which loads .env).
// Missing credentials or a failed fetch never fail the build: the previous
// snapshot is kept and the reason is logged.

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "src/data");

const write = (name, data) => {
    writeFileSync(resolve(dataDir, name), JSON.stringify(data, null, 4) + "\n");
    console.log(`✔ wrote  src/data/${name}`);
};
const keep = (name, why) => console.log(`· kept  src/data/${name} (${why})`);

// ---------------------------------------------------------------- Hardcover
async function syncReading() {
    const token = process.env.HARDCOVER_TOKEN;
    if (!token) return keep("reading.json", "no HARDCOVER_TOKEN");

    const query = `
        query CurrentReading {
            me {
                user_books(
                    where: { status_id: { _eq: 2 } }
                    order_by: { updated_at: desc }
                    limit: 1
                ) {
                    book {
                        title
                        contributions { author { name } }
                    }
                }
            }
        }`;

    try {
        const res = await fetch("https://api.hardcover.app/v1/graphql", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.errors?.length) throw new Error(json.errors[0].message);

        const me = Array.isArray(json.data?.me)
            ? json.data.me[0]
            : json.data?.me;
        const book = me?.user_books?.[0]?.book;
        if (!book?.title) return keep("reading.json", "no currently-reading book");

        const author = [...new Set((book.contributions ?? [])
            .map((c) => c.author?.name)
            .filter(Boolean))].join(", ");

        write("reading.json", {
            title: book.title,
            author: author || "Unknown",
            url:
                "https://openlibrary.org/search?q=" +
                encodeURIComponent(`${book.title} ${author}`.trim()),
            syncedAt: new Date().toISOString(),
        });
    } catch (err) {
        keep("reading.json", `Hardcover fetch failed: ${err.message}`);
    }
}

// ----------------------------------------------------------------- Spotify
async function syncSpotify() {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    const refresh = process.env.SPOTIFY_REFRESH_TOKEN;
    if (!id || !secret || !refresh)
        return keep("spotify.json", "missing Spotify credentials");

    try {
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                authorization: `Basic ${basic}`,
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refresh,
            }),
        });
        if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`);
        const { access_token } = await tokenRes.json();
        const auth = { authorization: `Bearer ${access_token}` };

        let item = null;
        let nowPlaying = false;
        let playedAt = new Date().toISOString();

        // playing right now?
        const nowRes = await fetch(
            "https://api.spotify.com/v1/me/player/currently-playing",
            { headers: auth },
        );
        if (nowRes.status === 200) {
            const body = await nowRes.json();
            if (body?.item) {
                item = body.item;
                nowPlaying = body.is_playing === true;
            }
        }

        // otherwise the last played track
        if (!item) {
            const recRes = await fetch(
                "https://api.spotify.com/v1/me/player/recently-played?limit=1",
                { headers: auth },
            );
            if (!recRes.ok) throw new Error(`recently-played HTTP ${recRes.status}`);
            const last = (await recRes.json())?.items?.[0];
            if (last?.track) {
                item = last.track;
                playedAt = last.played_at;
            }
        }

        if (!item) return keep("spotify.json", "nothing returned by Spotify");

        write("spotify.json", {
            track: item.name,
            artist: (item.artists ?? []).map((a) => a.name).join(", "),
            album: item.album?.name ?? null,
            url: item.external_urls?.spotify ?? null,
            playedAt,
            nowPlaying,
            syncedAt: new Date().toISOString(),
        });
    } catch (err) {
        keep("spotify.json", `Spotify fetch failed: ${err.message}`);
    }
}

await syncReading();
await syncSpotify();

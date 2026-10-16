// GET /api/now — live "last listen / now playing" for the About section.
//
// Reads Spotify with the refresh token from the Pages environment, then caches
// the result at the edge for 20 minutes. No cron and no rebuilds: the first
// request after the cache expires refreshes it, everyone else gets the cached
// copy instantly. The page falls back to the build-time snapshot if this
// endpoint is missing (localhost) or errors.
//
// Required Pages environment variables (Settings → Environment variables):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
// For local `wrangler pages dev`, put the same three lines in .dev.vars.

interface Env {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
}

interface Track {
  name: string;
  artists?: { name: string }[];
  external_urls?: { spotify?: string };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=1200" : "no-store",
    },
  });

async function accessToken(env: Env): Promise<string> {
  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.SPOTIFY_REFRESH_TOKEN as string,
    }),
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("no access_token");
  return body.access_token;
}

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  waitUntil,
}) => {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  if (
    !env.SPOTIFY_CLIENT_ID ||
    !env.SPOTIFY_CLIENT_SECRET ||
    !env.SPOTIFY_REFRESH_TOKEN
  ) {
    return json({ error: "Spotify environment variables are not configured" }, 501);
  }

  try {
    const auth = { authorization: `Bearer ${await accessToken(env)}` };

    let item: Track | null = null;
    let nowPlaying = false;
    let playedAt = new Date().toISOString();

    const now = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: auth },
    );
    if (now.status === 200) {
      const body = (await now.json()) as {
        is_playing?: boolean;
        item?: Track | null;
      };
      if (body?.item) {
        item = body.item;
        nowPlaying = body.is_playing === true;
      }
    }

    if (!item) {
      const recent = await fetch(
        "https://api.spotify.com/v1/me/player/recently-played?limit=1",
        { headers: auth },
      );
      if (!recent.ok) throw new Error(`recently-played HTTP ${recent.status}`);
      const body = (await recent.json()) as {
        items?: { track?: Track; played_at?: string }[];
      };
      const last = body.items?.[0];
      if (last?.track) {
        item = last.track;
        playedAt = last.played_at ?? playedAt;
      }
    }

    if (!item) return json({ error: "Spotify returned nothing" }, 502);

    const response = json({
      track: item.name,
      artist: (item.artists ?? []).map((a) => a.name).join(", "),
      url: item.external_urls?.spotify ?? null,
      nowPlaying,
      playedAt,
      syncedAt: new Date().toISOString(),
    });
    // The Cache API only accepts GET requests; HEAD reuses this handler.
    if (request.method === "GET") {
      waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
};

// HEAD mirrors GET's status and headers (no body).
export const onRequestHead: PagesFunction<Env> = async (context) => {
  const res = await onRequestGet(context);
  return new Response(null, { status: res.status, headers: res.headers });
};

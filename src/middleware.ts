// Dev-only stand-ins for the Pages Functions in functions/api/*.
// `astro dev` has no Functions runtime, so without these the now-line in dev
// would only ever show the build-time snapshot. In production builds this
// middleware is inert (DEV is false) and the real Functions serve /api/*.
import { defineMiddleware } from "astro:middleware";

const DEV = import.meta.env.DEV;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const env = (key: string) =>
  (import.meta.env as Record<string, string | undefined>)[key];

// ------------------------------------------------------------------ Spotify
async function spotify() {
  const id = env("SPOTIFY_CLIENT_ID");
  const secret = env("SPOTIFY_CLIENT_SECRET");
  const refresh = env("SPOTIFY_REFRESH_TOKEN");
  if (!id || !secret || !refresh)
    return json({ error: "Spotify env vars not in .env" }, 501);

  try {
    const basic = btoa(`${id}:${secret}`);
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
    const auth = {
      authorization: `Bearer ${(await tokenRes.json()).access_token}`,
    };

    let item: any = null;
    let nowPlaying = false;
    let playedAt = new Date().toISOString();

    const now = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: auth },
    );
    if (now.status === 200) {
      const body: any = await now.json();
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
      const last: any = (await recent.json())?.items?.[0];
      if (last?.track) {
        item = last.track;
        playedAt = last.played_at ?? playedAt;
      }
    }
    if (!item) return json({ error: "Spotify returned nothing" }, 502);

    return json({
      track: item.name,
      artist: (item.artists ?? []).map((a: any) => a.name).join(", "),
      url: item.external_urls?.spotify ?? null,
      nowPlaying,
      playedAt,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
}

// ---------------------------------------------------------------- Hardcover
const QUERY = `
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

async function hardcover() {
  const token = env("HARDCOVER_TOKEN");
  if (!token) return json({ error: "HARDCOVER_TOKEN not in .env" }, 501);

  try {
    const res = await fetch("https://api.hardcover.app/v1/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: any = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);

    const me = Array.isArray(body.data?.me) ? body.data.me[0] : body.data?.me;
    const book = me?.user_books?.[0]?.book;
    if (!book?.title) return json({ error: "no currently-reading book" }, 502);

    const author = [
      ...new Set(
        (book.contributions ?? [])
          .map((c: any) => c.author?.name)
          .filter(Boolean),
      ),
    ].join(", ");

    return json({
      title: book.title,
      author: author || "Unknown",
      url:
        "https://openlibrary.org/search?q=" +
        encodeURIComponent(`${book.title} ${author}`.trim()),
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
}

// ---------------------------------------------------------------- Page views
const VIEWS_QUERY = `
    query PageViews($account: String!, $tag: String!, $paths: [String!]!, $since: Date!) {
        viewer {
            accounts(filter: { accountTag: $account }) {
                rumPageloadEventsAdaptiveGroups(
                    filter: { siteTag: $tag, requestPath_in: $paths, date_geq: $since }
                    limit: 1
                ) {
                    count
                    sum { visits }
                }
            }
        }
    }`;

async function views(url: URL) {
  const token = env("CF_ANALYTICS_TOKEN");
  const account = env("CF_ACCOUNT_ID");
  const tag = env("CF_WEB_ANALYTICS_TAG");
  if (!token || !account || !tag) return json({ views: 0, visits: 0 });

  // The page path arrives as a path segment: /api/views/blog/some-post
  const path = url.pathname.slice("/api/views".length) || "/";
  if (!path.startsWith("/")) return json({ views: 0, visits: 0 });
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: VIEWS_QUERY,
        variables: {
          account,
          tag,
          paths: [path, path.endsWith("/") ? path : `${path}/`],
          since: new Date(Date.now() - 6 * 86400_000)
            .toISOString()
            .slice(0, 10),
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: any = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);
    const group = body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups?.[0];
    return json({ path, views: group?.count ?? 0, visits: group?.sum?.visits ?? 0 });
  } catch {
    return json({ views: 0, visits: 0 });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!DEV) return next(); // production: the Pages Functions handle /api/*
  if (context.url.pathname === "/api/now") return spotify();
  if (context.url.pathname === "/api/reading") return hardcover();
  if (context.url.pathname.startsWith("/api/views")) return views(context.url);
  return next();
});

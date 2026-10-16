// GET /api/reading — live "current read" for the About section.
//
// Queries Hardcover with the token from the Pages environment and caches the
// result at the edge for 30 days. No cron and no rebuilds: the first request
// after the cache expires refreshes it. The page falls back to the build-time
// snapshot if this endpoint is missing (localhost) or errors.
//
// Note: a 30-day TTL means a finished book can linger on the site for up to a
// month — change CACHE_SECONDS below (86400 = daily) if you'd rather not.
//
// Required Pages environment variables (Settings → Environment variables):
//   HARDCOVER_TOKEN
// For local `wrangler pages dev`, put the same line in .dev.vars.

interface Env {
  HARDCOVER_TOKEN?: string;
}

const CACHE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        status === 200
          ? `public, max-age=${CACHE_SECONDS}`
          : "no-store",
    },
  });

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

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  waitUntil,
}) => {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  if (!env.HARDCOVER_TOKEN) {
    return json({ error: "HARDCOVER_TOKEN is not configured" }, 501);
  }

  try {
    const res = await fetch("https://api.hardcover.app/v1/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.HARDCOVER_TOKEN}`,
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      errors?: { message?: string }[];
      data?: {
        me?:
          | {
              user_books?: {
                book?: {
                  title?: string;
                  contributions?: { author?: { name?: string } }[];
                };
              }[];
            }[]
          | {
              user_books?: {
                book?: {
                  title?: string;
                  contributions?: { author?: { name?: string } }[];
                };
              }[];
            };
      };
    };
    if (body.errors?.length) throw new Error(body.errors[0].message);

    const me = Array.isArray(body.data?.me) ? body.data.me[0] : body.data?.me;
    const book = me?.user_books?.[0]?.book;
    if (!book?.title) return json({ error: "no currently-reading book" }, 502);

    const author = [
      ...new Set(
        (book.contributions ?? [])
          .map((c) => c.author?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ].join(", ");

    const response = json({
      title: book.title,
      author: author || "Unknown",
      url:
        "https://openlibrary.org/search?q=" +
        encodeURIComponent(`${book.title} ${author}`.trim()),
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

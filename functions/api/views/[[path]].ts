// GET /api/views/<page path> — page views for one path, read back from
// Cloudflare Web Analytics (RUM) through the GraphQL Analytics API.
//
// The page path travels as a path segment (e.g. /api/views/blog/some-post)
// because it survives every runtime, unlike query strings in some contexts.
//
// Required Pages environment variables:
//   CF_ANALYTICS_TOKEN     API token with Account → Analytics → Read
//   CF_ACCOUNT_ID          the Cloudflare account id
//   CF_WEB_ANALYTICS_TAG   the Web Analytics site tag (from the beacon snippet)
//
// Cached at the edge for 15 minutes. The page hides its element on any error,
// so an unconfigured deploy is fine.
//
// The count covers the last 6 days: Cloudflare's RUM adaptive groups reject
// query ranges longer than a week (longer ranges silently return nothing).

interface Env {
  CF_ANALYTICS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_WEB_ANALYTICS_TAG?: string;
}

const CACHE_SECONDS = 900;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
    },
  });

const QUERY = `
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

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
  waitUntil,
}) => {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WEB_ANALYTICS_TAG) {
    return json({ error: "Cloudflare analytics env vars are not configured" }, 501);
  }

  const segment = Array.isArray(params.path) ? params.path.join("/") : (params.path ?? "");
  const path = `/${segment}`;
  if (path === "/") return json({ error: "path is required" }, 400);

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          account: env.CF_ACCOUNT_ID,
          tag: env.CF_WEB_ANALYTICS_TAG,
          paths: [path, path.endsWith("/") ? path : `${path}/`],
          since: new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10),
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      errors?: { message?: string }[];
      data?: {
        viewer?: {
          accounts?: {
            rumPageloadEventsAdaptiveGroups?: {
              count?: number;
              sum?: { visits?: number };
            }[];
          }[];
        };
      };
    };
    if (body.errors?.length) throw new Error(body.errors[0].message);

    const group = body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups?.[0];

    const response = json({
      path,
      views: group?.count ?? 0,
      visits: group?.sum?.visits ?? 0,
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

import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import satori, { type Font } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Convert a Node Buffer to a standalone ArrayBuffer (not the shared pool). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const projectRoot = process.cwd();

const dotoFont = readFileSync(
  resolve(projectRoot, "src/fonts/Doto-Bold.ttf"),
);
const monoFont = readFileSync(
  resolve(projectRoot, "src/fonts/ShareTechMono-Regular.ttf"),
);
const sansFont = readFileSync(
  resolve(projectRoot, "src/fonts/OpenSans-Regular.ttf"),
);

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("blog", ({ data }) => data.draft !== true);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: {
      title: post.data.title,
      description: post.data.description,
      tag: post.data.tag,
      date: post.data.date,
    },
  }));
};

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(dateStr))
    .toUpperCase();
}

export const GET: APIRoute = async ({ props }) => {
  const { title, description, tag, date } = props as {
    title: string;
    description: string;
    tag: string;
    date: string;
  };

  const metaLine = `[${tag.toUpperCase()}]   ${formatDate(date)}`;

  // Satori accepts plain VNode objects at runtime but types expect ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: "1200px",
          height: "630px",
          backgroundColor: "#142f82",
          padding: "72px 80px",
          boxSizing: "border-box",
        },
        children: [
          {
            type: "p",
            props: {
              style: {
                fontFamily: "Share Tech Mono",
                fontSize: "22px",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.65)",
                marginBottom: "24px",
                display: "flex",
              },
              children: metaLine,
            },
          },
          {
            type: "h1",
            props: {
              style: {
                fontFamily: "Doto",
                fontSize: "86px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                lineHeight: 1.1,
                color: "#ffb74d",
                textTransform: "uppercase",
                margin: "0 0 32px 0",
                display: "flex",
                flexWrap: "wrap",
              },
              children: title.toUpperCase(),
            },
          },
          {
            type: "p",
            props: {
              style: {
                fontFamily: "Open Sans",
                fontSize: "26px",
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.82)",
                display: "flex",
                maxWidth: "900px",
              },
              children: description,
            },
          },
        ],
      },
    };

  const fonts: Font[] = [
    { name: "Doto", data: toArrayBuffer(dotoFont), weight: 700, style: "normal" },
    { name: "Share Tech Mono", data: toArrayBuffer(monoFont), weight: 400, style: "normal" },
    { name: "Open Sans", data: toArrayBuffer(sansFont), weight: 400, style: "normal" },
  ];

  const svg = await satori(element, { width: 1200, height: 630, fonts });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  const png = resvg.render().asPng();

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

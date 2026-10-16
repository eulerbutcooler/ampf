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
  resolve(projectRoot, "src/fonts/IBMPlexMono-Regular.ttf"),
);
const sansFont = readFileSync(
  resolve(projectRoot, "src/fonts/IBMPlexSans-Regular.ttf"),
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

/** The site's dotted rule, drawn as a row of dots so it renders identically
 *  everywhere (satori's dotted borders are unreliable). */
function dottedRule() {
  const dots = 116;
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        margin: "0 0 30px 0",
      },
      children: Array.from({ length: dots }, () => ({
        type: "div",
        props: {
          style: {
            width: "3px",
            height: "3px",
            borderRadius: "50%",
            backgroundColor: "rgba(244, 245, 247, 0.26)",
            display: "flex",
          },
        },
      })),
    },
  };
}

export const GET: APIRoute = async ({ props }) => {
  const { title, description, tag, date } = props as {
    title: string;
    description: string;
    tag: string;
    date: string;
  };

  const element: any = {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "1200px",
          height: "630px",
          backgroundColor: "#08090c",
          // the dusk glow from the hero artwork, kept faint
          backgroundImage:
            "radial-gradient(circle at 84% 82%, rgba(255, 183, 77, 0.16), rgba(255, 183, 77, 0) 52%)",
          padding: "72px 80px",
          boxSizing: "border-box",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "baseline",
                gap: "26px",
                marginBottom: "18px",
                fontFamily: "IBM Plex Mono",
                fontSize: "22px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { color: "#8b9bff", display: "flex" },
                    children: `[${tag}]`,
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { color: "rgba(244, 245, 247, 0.6)", display: "flex" },
                    children: formatDate(date),
                  },
                },
              ],
            },
          },
          dottedRule(),
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
                fontFamily: "IBM Plex Sans",
                fontSize: "26px",
                lineHeight: 1.5,
                color: "rgba(244, 245, 247, 0.82)",
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
    { name: "IBM Plex Mono", data: toArrayBuffer(monoFont), weight: 400, style: "normal" },
    { name: "IBM Plex Sans", data: toArrayBuffer(sansFont), weight: 400, style: "normal" },
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

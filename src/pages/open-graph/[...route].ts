import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";

const blogEntries = await getCollection(
  "blog",
  ({ data }) => data.draft !== true,
);

const pages = Object.fromEntries(blogEntries.map(({ id, data }) => [id, data]));

// Add the landing page as a static entry
pages["index"] = {
  title: "eulerbutcooler",
  description:
    "Full-stack developer building fast, reliable systems at the edge of the web.",
  tag: "",
  date: "",
  draft: false,
};

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "route",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[20, 47, 130]],
    border: {
      color: [230, 81, 0],
      width: 6,
      side: "inline-start",
    },
    font: {
      title: {
        color: [255, 255, 255],
        size: 64,
        lineHeight: 1.2,
        weight: "Bold",
      },
      description: {
        color: [180, 200, 255],
        size: 32,
        lineHeight: 1.4,
      },
    },
    padding: 60,
  }),
});

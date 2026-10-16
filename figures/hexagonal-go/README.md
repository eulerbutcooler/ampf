# Hexagonal architecture bench rig

Source for `public/figures/hexagonal-go.html`, the interactive figure embedded in
`src/content/blog/hexagonal-architecture-go-monorepo.mdx`.

Build (writes the standalone page next to this script, then copy it to `public/figures/`):

    node build.mjs            # build
    node build.mjs --audit    # build + prove the geometry (depth order, clearance, terminals…)

It imports the isometric kit from the `anatomy` skill
(`~/.agents/skills/anatomy/kit/…`) and expects headless Chrome only for the
optional screenshot/line checks (`scripts/capture.mjs`, `scripts/lines.mjs`).

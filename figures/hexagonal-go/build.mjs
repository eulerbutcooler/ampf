// Hexagonal architecture in a Go monorepo — a benchtop patch rig.
// One bench (one module). A hexagonal core (domain + service). Three port bases on the
// deck (http, repository, mailer); adapters are cartridges that drop into a base.
// Buttons: send a request, swap the repository adapter, run the tests.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/home/amaan/.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/home/amaan/.agents/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "/home/amaan/.agents/skills/anatomy/kit/tube.mjs";
import * as A from "/home/amaan/.agents/skills/anatomy/kit/audit.mjs";
import { kitScript } from "/home/amaan/.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

const W = 720, H = 452;
const DEG = Math.PI / 180;
const cos = Math.cos, sin = Math.sin;

// ---------------------------------------------------------------- world constants
const DRUM = [0, -5];
const APO = 38;
const DECK = { x: -190, y: -112, w: 380, d: 232, r: 12 };
const DECK_H = 12, FOOT_H = 5;
const CORNICE = 41, PLINTH = 40;
const HOUSING_Z0 = 4, HOUSING_Z1 = 40, CORNICE_Z1 = 44;
const COLLAR_Z1 = 46, KNOB_Z1 = 54;
const BASE_C = 53;                    // base centre, measured from the drum centre
const CART_Z0 = 10, CART_Z1 = 34, GRIP_Z1 = 41;
const CABLE_Z = 7;                    // deck-level cable centreline
const SLOT_A = [-104, 16];            // memory cartridge home
const SLOT_B = [-104, -28];           // postgres parks here

const portOf = (deg) => {
  const r = deg * DEG;
  const n = [cos(r), sin(r), 0];
  const t = [-sin(r), cos(r), 0];
  const mid = [DRUM[0] + APO * n[0], DRUM[1] + APO * n[1]];
  const outer = [DRUM[0] + BASE_C * n[0], DRUM[1] + BASE_C * n[1]];
  return { deg, n, t, mid, outer };
};
const HTTP = portOf(90), REPO = portOf(30), MAIL = portOf(150);

const plateFrame = (p, z = 0) => G.frameOf([p.mid[0], p.mid[1], z], p.n, p.t, [0, 0, 1]);
const baseFrame = (p, z = 0) => G.frameOf([p.outer[0], p.outer[1], z], [0, 0, 1], p.t, p.n);
const axisFrame = (p, z) => G.frameOf([p.outer[0], p.outer[1], z], p.n, p.t, [0, 0, 1]);
const world = (p, u, v, s = 0) => [p.outer[0] + p.t[0] * u + p.n[0] * s, p.outer[1] + p.t[1] * u + p.n[1] * s, v];
const at3 = (F, s, u, v) => G.add3(G.pointOf(F, s, 0, 0), G.add3(G.mul3(F.u, u), G.mul3(F.v, v)));
const alongPort = (p, s, z = 0) => [DRUM[0] + s * p.n[0], DRUM[1] + s * p.n[1], z];

const hexPts = (apothem) => Array.from({ length: 6 }, (_, i) => {
  const a = (60 * i) * DEG, R = apothem / cos(30 * DEG);
  return [DRUM[0] + R * cos(a), DRUM[1] + R * sin(a)];
});

const rrect = (w, h, r, steps = 3) => {
  const pts = [];
  const corners = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, start] of corners)
    for (let step = 0; step <= steps; step++) {
      const a = (start + (90 * step) / steps) * DEG;
      pts.push([cx + r * cos(a), cy + r * sin(a)]);
    }
  return pts;
};
const shiftPoly = (poly, dx, dy) => poly.map(([x, y]) => [x + dx, y + dy]);

// ---------------------------------------------------------------- projection
const fit = [
  ...k.boxCorners(DECK, -DECK_H - FOOT_H, 0),
  [DRUM[0], DRUM[1], KNOB_Z1],
  [HTTP.outer[0], HTTP.outer[1], GRIP_Z1 + 1],
  [REPO.outer[0], REPO.outer[1], GRIP_Z1 + 1],
  [MAIL.outer[0], MAIL.outer[1], GRIP_Z1 + 1],
  [SLOT_A[0], SLOT_A[1], GRIP_Z1],
  [150, 100, 34],
  [-134, 84, 24],
];
const P = k.fitProjection(fit, W, H, { pad: 16, azimuth: 45, elevation: 30 });
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const KK = k.cameraOf(P).k;
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);

const screenVec = (p) => { const o = k.iso([0, 0, 0], P), q = k.iso(p, P); return [q[0] - o[0], q[1] - o[1]]; };
const planeM = (o3, u3, d3) => {
  const o = k.iso(o3, P), u = screenVec(u3), d = screenVec(d3);
  return `matrix(${u[0].toFixed(4)} ${u[1].toFixed(4)} ${d[0].toFixed(4)} ${d[1].toFixed(4)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`;
};
const faceText = (o3, u3, text, { size = 3, tone = "lo", anchor = "middle" } = {}) => k.faceTextSvg(planeM(o3, u3, [0, 0, -1]), text, { size, tone, anchor });

// ---------------------------------------------------------------- recorder
const R = A.recorder(P, {});
const items = [];
function put(name, ref, inner, { shapes = [], label, bias = 0 } = {}) {
  const svg = `<g data-name="${name}"${label ? ` data-label="${label}"` : ""}>${inner}</g>`;
  const item = R.put({ name, at: ref, bias, svg, shapes });
  items.push(item);
  return item;
}
const record = R.solid;
const ringDots = (pts, size = 0.45, tone = "mid") => Dots(pts, { size, tone });

function cable(name, route, r, { tone = "mid", gaps = [], label, ends = [true, true], rims, ref, bias = 0.05 } = {}) {
  R.route(name, route, r, { gaps, ends, rims, limp: true, name });
  tubePieces(route, r, P, { maxLength: 14, spacing: 1.2, gaps }).forEach((part, index) => {
    put(`${name}:${index}`, part.mid, tubeSvg(part, { tone }), { bias, shapes: [A.tube(part.points, part.radii, { name: `${name}:${index}`, owner: name })], label: index === 0 ? label : undefined });
  });
}

// ---------------------------------------------------------------- deck
{
  const halo = `<path class="iso-halo" d="${k.haloOf(DECK, -DECK_H - FOOT_H, DECK_H, P)}"/>`;
  const feet = k.corners(DECK, 26).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    put("deck.foot", [x, y, -DECK_H], S(k.cylinder(x, y, 9, -DECK_H - FOOT_H, 2, P, 28), { tone: "lo" }) + S(k.cylinder(x, y, 6.6, -DECK_H - FOOT_H + 2, FOOT_H - 2, P, 28), { tone: "mid" }),
      { bias: -0.5, shapes: [record(A.cylinder(x, y, 9, -DECK_H - FOOT_H, FOOT_H, { name: "stand.foot" }))] });
  }
  const screws = k.corners(DECK, 22);
  const inner =
    Ln(k.planOutline(k.insetPlan(DECK, 6), 0, P), { tone: "faint" }) +
    Ln(k.planOutline(k.insetPlan(DECK, 11), 0, P), { tone: "faint" }) +
    Ln(screws.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 16)).join(""), { tone: "lo" }) +
    ringDots(screws.map(([x, y]) => at([x, y, 0])), 0.5);
  put("deck", [0, 0, -DECK_H / 2], halo + S(k.slabOf(DECK, -DECK_H, DECK_H, P, 10, 1.4), { tone: "mid" }) + inner, {
    bias: -2, label: "cmd/api/main.go · wiring only: one bench holds the whole repo",
    shapes: [record(A.slab(DECK, -DECK_H, DECK_H, { name: "stand.deck" }, 10))],
  });
}

// ruler strip along the back edge
{
  const strip = { x: -166, y: -106, w: 332, d: 8, r: 1 };
  const ticks = k.topTicks(strip.x + 6, strip.x + strip.w - 6, 5, 5, strip.y + 0.6, 0.8, [2, 3.6], P);
  put("deck.ruler", [strip.x + strip.w / 2, strip.y + strip.d / 2, 0.8],
    S(k.slabOf(strip, 0, 0.8, P, 3), { tone: "lo", crease: "none" }) +
    Ln(ticks.minor, { tone: "lo" }) + Ln(ticks.major, { tone: "mid" }) +
    ringDots([at([strip.x + 3, strip.y + 4, 0.8]), at([strip.x + strip.w - 3, strip.y + 4, 0.8])], 0.45),
    { bias: -1.5, shapes: [record(A.slab(strip, 0, 0.8, { name: "deck.ruler" }, 3))] });
}

const plate = (name, plan, text, size) => {
  const inner = S(k.slabOf(plan, 0, 0.9, P, 4), { tone: "lo", crease: "none" }) +
    Ln(k.planOutline(k.insetPlan(plan, 1.4), 0.9, P, 3), { tone: "faint" }) +
    faceText([plan.x + plan.w / 2, plan.y + plan.d / 2, 0.95], [1, 0, 0], text, { size, tone: "mid" }) +
    ringDots([at([plan.x + 2.4, plan.y + plan.d / 2, 0.9]), at([plan.x + plan.w - 2.4, plan.y + plan.d / 2, 0.9])], 0.4);
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, 0.9], inner, { bias: -1.4, shapes: [record(A.slab(plan, 0, 0.9, { name }, 4))] });
};
plate("deck.gomod", { x: -146, y: -84, w: 66, d: 19, r: 2 }, "go.mod", 3.4);
plate("deck.main", { x: 58, y: -84, w: 96, d: 19, r: 2 }, "cmd/api/main.go", 3.4);

{
  const vent = { x: -34, y: -92, w: 52, d: 24, r: 3 };
  const holes = k.dotGrid(vent.x + 7, vent.y + 6, 5, 3, 9, 1.4, P);
  put("deck.vent", [vent.x + vent.w / 2, vent.y + vent.d / 2, 1.4],
    S(k.slabOf(vent, 0, 1.4, P, 5), { tone: "lo", crease: "none" }) + Ln(k.planOutline(k.insetPlan(vent, 2), 1.4, P, 5), { tone: "faint" }) + Dots(holes, { size: 0.8, tone: "faint" }),
    { bias: -1.2, shapes: [record(A.slab(vent, 0, 1.4, { name: "deck.vent" }, 5))] });
  const stud = [34, -84];
  put("deck.stud", [stud[0], stud[1], 1.5],
    S(k.cylinder(stud[0], stud[1], 3.4, 0, 2, P, 20), { tone: "mid" }) + S(k.cylinder(stud[0], stud[1], 2.1, 2, 2.6, P, 16), { tone: "hi" }) + Ln(k.ring(stud[0], stud[1], 1.5, 4.6, P, 12), { tone: "lo" }),
    { bias: -1.2, shapes: [record(A.cylinder(stud[0], stud[1], 3.4, 0, 4.6, { name: "deck.stud" }))] });
}

{
  const tray = { x: -160, y: 92, w: 34, d: 22, r: 3 };
  put("deck.tray", [tray.x + tray.w / 2, tray.y + tray.d / 2, 3],
    S(k.slabOf(tray, 0, 3, P, 5), { tone: "lo", crease: "none" }) + Ln(k.planOutline(k.insetPlan(tray, 3), 3, P, 5), { tone: "faint" }),
    { bias: -1.2, shapes: [record(A.slab(tray, 0, 3, { name: "deck.tray" }, 5))] });
  const sc = [[tray.x + 10, tray.y + 7], [tray.x + 24, tray.y + 8]];
  sc.forEach(([x, y], i) => {
    put(`deck.tray.scr${i}`, [x, y, 4.2], S(k.cylinder(x, y, 2.2, 3, 2.4, P, 16), { tone: "mid" }) + Ln(k.knurl(x, y, 2.2, 3.06, 5.34, 12, P, 0.06), { tone: "lo" }),
      { bias: -0.6, shapes: [record(A.cylinder(x, y, 2.2, 3, 2.4, { name: "deck.tray.scr" }))] });
  });
  const fx = tray.x + 15, fy = tray.y + 15;
  put("deck.tray.fuse", [fx, fy, 4.6], S(k.cylinder(fx, fy, 1.8, 3, 6, P, 14), { tone: "hi", crease: "lo" }) + Ln(k.ring(fx, fy, 1.2, 9, P, 12), { tone: "lo" }) + Ln(k.lineOnTop([fx - 1.8, fy], [fx + 1.8, fy], 9, P), { tone: "faint" }),
    { bias: -0.6, shapes: [record(A.cylinder(fx, fy, 1.8, 3, 6, { name: "deck.tray.fuse" }))] });
}

// ---------------------------------------------------------------- drum
const hexHousing = hexPts(APO), hexPlinth = hexPts(PLINTH), hexCornice = hexPts(CORNICE);
{
  const groove = Ln(k.ringSeam(hexPlinth, 4, P), { tone: "faint" });
  const dots = Dots(hexPlinth.map((p) => at([p[0] * 0.97, p[1] * 0.97, 4])), { size: 0.45, tone: "mid" });
  put("drum.plinth", [DRUM[0], DRUM[1], 2], S(k.extrude(hexPlinth, 0, 4, P, { convex: true, bevel: 0.6 }), { tone: "mid", inner: groove }) + dots,
    { bias: 0.2, shapes: [record(A.extruded(hexPlinth, 0, 4, { name: "drum.plinth" }))] });
  const seam = Ln(k.ringSeam(hexHousing, 26, P), { tone: "faint" });
  put("drum.housing", [DRUM[0], DRUM[1], (HOUSING_Z0 + HOUSING_Z1) / 2], S(k.extrude(hexHousing, HOUSING_Z0, HOUSING_Z1 - HOUSING_Z0, P, { convex: true, bevel: 1.2 }), { tone: "hi", inner: seam }),
    { bias: 0.3, label: "the hexagon: domain + service · imports nothing from the repo", shapes: [record(A.extruded(hexHousing, HOUSING_Z0, HOUSING_Z1 - HOUSING_Z0, { name: "drum.housing" }))] });
  const slots = [30, 150, 270].map((deg) => {
    const a = deg * DEG, R = 30;
    const c = [DRUM[0] + R * cos(a), DRUM[1] + R * sin(a)];
    return Ln(k.planOutline({ x: c[0] - 5, y: c[1] - 1.4, w: 10, d: 2.8, r: 1.2 }, CORNICE_Z1, P, 4), { tone: "faint" });
  }).join("");
  put("drum.cornice", [DRUM[0], DRUM[1], (HOUSING_Z1 + CORNICE_Z1) / 2], S(k.extrude(hexCornice, HOUSING_Z1, CORNICE_Z1 - HOUSING_Z1, P, { convex: true, bevel: 1.0 }), { tone: "mid" }) +
    Ln(k.planOutline({ x: DRUM[0] - 33, y: DRUM[1] - 33, w: 66, d: 66, r: 20 }, CORNICE_Z1, P, 6), { tone: "faint" }) + slots +
    Dots(hexCornice.map((p) => at([p[0] * 0.94, p[1] * 0.94, CORNICE_Z1])), { size: 0.45, tone: "mid" }),
    { bias: 0.4, shapes: [record(A.extruded(hexCornice, HOUSING_Z1, CORNICE_Z1 - HOUSING_Z1, { name: "drum.cornice" }))] });
  const collarF = G.frameAlong([DRUM[0], DRUM[1], CORNICE_Z1], [0, 0, 1]);
  put("drum.collar", [DRUM[0], DRUM[1], CORNICE_Z1 + 1], S(G.disc(0, 2, 15, collarF, P, { bevel: 0.4 }), { tone: "mid" }),
    { bias: 0.5, shapes: [record(A.disc(collarF, 0, 2, 15, { name: "drum.collar" }))] });
  const knobF = G.frameAlong([DRUM[0], DRUM[1], COLLAR_Z1], [0, 0, 1]);
  // cosine dome from r 13 at s 2 to a flat top r 3.5 at s 13 (analytic slope: monotone)
  const domeR = (s) => 3.5 + 9.5 * cos((Math.PI * (s - 5)) / 16);
  const domeSlope = (s) => -((9.5 * Math.PI) / 16) * sin((Math.PI * (s - 5)) / 16);
  const profile = [[0, 13], [5, 13], ...Array.from({ length: 9 }, (_, i) => { const s = 5 + (8 * i) / 8; return [s, domeR(s), 1]; }), [13, 3.5]];
  const ribs = G.ribsOf(knobF, 0.08, 4.95, 13, 26, P, { fade: [0.08, 0.5] });
  put("drum.knob", [DRUM[0], DRUM[1], COLLAR_Z1 + 6], S(G.solidOf(profile, knobF, P, { smooth: { slope: domeSlope }, bevel: 0 }), { tone: "hi", crease: "lo" }) +
    Faded(ribs, { tone: "lo" }) + Ln(G.arcOf(knobF, 4.98, 13, P, { slope: domeSlope(5) }), { tone: "faint" }) +
    Dots(G.dotsOf(knobF, 12, 4, 6, P, { all: true, fade: [0.1, 0.5] }), { size: 0.4, tone: "mid" }),
    { bias: 0.6, label: "domain · entities, value objects, errors · zero imports", shapes: [record(A.solid(knobF, profile, { name: "drum.knob", radius: domeR }))] });
}

// ---------------------------------------------------------------- port plates (6 faces)
const PORT_LABEL = { 90: "port: UserHandler — net/http speaks here", 30: "port: UserRepository — the interface the service holds", 150: "port: Mailer — the service only knows the interface" };
for (const p of [portOf(90), portOf(30), portOf(150), portOf(210), portOf(270), portOf(330)]) {
  const F = plateFrame(p);
  const used = [90, 30, 150].includes(p.deg);
  const poly = rrect(40, 28, 2.5);
  const body = S(G.prismOf(F, shiftPoly(poly, 0, 22), 0, 2, P), { tone: used ? "hi" : "mid" });
  const detail = [];
  if (used) {
    detail.push(Ln([-9, -3, 3, 9].map((u) => G.circleOf(G.frameOf(at3(F, 2.05, u, 11), p.n, p.t, [0, 0, 1]), 0, 2.2, P, 12)).join(""), { tone: "lo" }));
    detail.push(Dots([-9, -3, 3, 9].map((u) => at(at3(F, 2, u, 11))), { size: 0.5, tone: "mid" }));
    for (const v of [24, 27, 30]) detail.push(Ln(k.segment(at3(F, 2.05, -8, v), at3(F, 2.05, 8, v), P), { tone: "faint", free: true }));
    detail.push(Ln(k.segment(at3(F, 2.05, 0, 17), at3(F, 2.05, 0, 20), P), { tone: "faint", free: true }));
  } else {
    detail.push(Ln(G.circleOf(G.frameOf(at3(F, 2.05, 0, 22), p.n, p.t, [0, 0, 1]), 0, 8, P, 18), { tone: "faint" }));
    detail.push(Dots([at(at3(F, 2.05, 0, 22))], { size: 0.45, tone: "mid" }));
  }
  const screws = [at3(F, 2.05, -17, 10.5), at3(F, 2.05, 17, 10.5)];
  const screwF = [[-17, 10.5], [17, 10.5]].map(([u, v]) => G.frameOf(at3(F, 2.05, u, v), p.n, p.t, [0, 0, 1]));
  detail.push(Ln(screwF.map((f) => G.circleOf(f, 0, 1.6, P, 12)).join(""), { tone: "faint" }));
  put(`port.${p.deg}`, [p.mid[0], p.mid[1], 22], body + detail.join("") + ringDots(screws.map((q) => at(q)), 0.45), {
    bias: 0.4, label: PORT_LABEL[p.deg],
    shapes: [record(A.prism(F, shiftPoly(poly, 0, 22), 0, 2, { name: `port.${p.deg}` }))],
  });
}

// ---------------------------------------------------------------- bases, cartridges, bus bars
function baseOf(p, label) {
  const F = baseFrame(p);
  const F_in = axisFrame(p, 11);
  const poly = rrect(24, 22, 3);
  const body = S(G.prismOf(F, poly, 0, 10, P), { tone: "mid" });
  const detail = [];
  detail.push(Ln([[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]].map(([u, v]) => G.circleOf(G.frameOf(at3(F, 10.05, u, v), [0, 0, 1], p.t, p.n), 0, 2.4, P, 12)).join(""), { tone: "faint" }));
  detail.push(Dots([[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]].map(([u, v]) => at(at3(F, 10.02, u, v))), { size: 0.55, tone: "lo" }));
  detail.push(Ln(G.circleOf(F, 10.05, 8.5, P, 20), { tone: "faint" }));
  const keyPts = rrect(4, 3, 1).map(([x, y]) => at3(F, 10.05, x - 10.5, y));
  detail.push(Ln(k.onTop(keyPts.map(([x, y]) => [x, y]), 10.05, P, true), { tone: "lo" }));
  const bossF = G.frameAlong(alongPort(p, 64, CABLE_Z), p.n);
  detail.push(S(G.disc(0, 3, 3.4, bossF, P, { bevel: 0.4 }), { tone: "mid" }));
  detail.push(Ln(G.circleOf(bossF, 3, 2, P, 14), { tone: "faint" }));
  detail.push(Ln([-9, -3, 3, 9].map((u) => G.circleOf(G.frameOf(at3(F_in, -11, u, 11), p.n, p.t, [0, 0, 1]), 0, 2.2, P, 12)).join(""), { tone: "lo" }));
  detail.push(Dots([-9, -3, 3, 9].map((u) => at(at3(F_in, -11, u, 11))), { size: 0.45, tone: "mid" }));
  const screwAt = [[-10, -8], [10, -8]].map(([u, v]) => G.frameOf(at3(F, 10.05, u, v), [0, 0, 1], p.t, p.n));
  detail.push(Ln(screwAt.map((f) => G.circleOf(f, 0, 1.6, P, 12)).join(""), { tone: "faint" }));
  detail.push(ringDots(screwAt.map((f) => at(G.pointOf(f, 0, 0, 0))), 0.45));
  const base = record(A.prism(F, poly, 0, 10, { name: `base.${p.deg}` }));
  put(`base.${p.deg}`, [p.outer[0], p.outer[1], 5], body + detail.join(""), {
    bias: 0.5, label,
    shapes: [base, record(A.disc(bossF, 0, 3, 3.4, { name: `base.${p.deg}.gland` }))],
  });
  return base;
}

function busBars(p) {
  const F = plateFrame(p, 11);
  const poly = (u) => [[u - 1.15, 9.85], [u + 1.15, 9.85], [u + 1.15, 12.15], [u - 1.15, 12.15]];
  const inner = [-9, -3, 3, 9].map((u) => S(G.prismOf(F, poly(u), 2, 4, P), { tone: "mid" })).join("");
  put(`bus.${p.deg}`, [p.mid[0], p.mid[1], 11], inner, { bias: 0.55, shapes: [-9, -3, 3, 9].map((u) => record(A.prism(F, poly(u), 2, 4, { name: `bus.${p.deg}` }))) });
}

function cartridge(port, text, label, name, { baseShape, baseShapes } = {}) {
  const F = baseFrame(port, CART_Z0);
  const poly = rrect(22, 14, 2.5);
  const bandPoly = rrect(23.2, 15.2, 2.5);
  const shell = S(G.prismOf(F, poly, 0, CART_Z1 - CART_Z0, P), { tone: "hi" });
  const band = S(G.prismOf(F, bandPoly, 12, 17, P), { tone: "mid" });
  const text3 = at3(F, 14.5, 0, 7.6);
  const along = screenVec(port.t)[0] > 0 ? port.t : [-port.t[0], -port.t[1], 0];
  const body = shell + band + faceText([text3[0], text3[1], text3[2]], along, text, { size: 3.2, tone: "lo" });
  const gripF = G.frameAlong(G.pointOf(F, CART_Z1 - CART_Z0, 0, 0), [0, 0, 1]);
  const ribs = G.ribsOf(gripF, 0.08, GRIP_Z1 - CART_Z1 - 1.4, 6.4, 20, P, { fade: [0.08, 0.5] });
  const grip = S(G.disc(0, GRIP_Z1 - CART_Z1, 6.4, gripF, P, { bevel: 0.5 }), { tone: "hi" }) +
    Faded(ribs, { tone: "lo" }) + Ln(G.arcOf(gripF, GRIP_Z1 - CART_Z1 - 1.4, 6.4, P, { slope: -2.2 }), { tone: "faint" }) +
    Dots([at(G.pointOf(gripF, GRIP_Z1 - CART_Z1, 0, 0))], { size: 0.5, tone: "hi" });
  const centre = G.pointOf(F, (CART_Z1 - CART_Z0) / 2, 0, 0);
  const shellShape = record(A.prism(F, poly, 0, CART_Z1 - CART_Z0, { name }));
  put(name, [centre[0], centre[1], centre[2]], body + grip, {
    bias: 0.75, label,
    shapes: [shellShape, record(A.prism(F, bandPoly, 12, 17, { name: `${name}.band`, seated: true, cut: [shellShape] })), record(A.disc(gripF, 0, GRIP_Z1 - CART_Z1, 6.4, { name: `${name}.grip` }))],
  });
  // the pins are their own item: seated they sit inside the base's holes, so the base paints over them
  const pinAt = [[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]];
  const pinShapes = pinAt.map(([u, v]) => record(A.disc(G.frameAlong(at3(F, -5.5, u, v), [0, 0, 1]), 0, 5.5, 1.5, { name: `${name}.pin`, seated: true, cut: [baseShape, ...(baseShapes ?? [])].filter(Boolean) })));
  put(`${name}.pins`, [centre[0], centre[1], CART_Z0 - 3], pinAt.map(([u, v]) => S(G.disc(0, 5.5, 1.5, G.frameAlong(at3(F, -5.5, u, v), [0, 0, 1]), P), { tone: "hi", crease: "lo" })).join(""),
    { bias: 0.7, shapes: pinShapes });
}

const httpBase = baseOf(HTTP, "the handler base: the port the client's request enters");
const repoBase = baseOf(REPO, "the repository base: the interface is declared in the core, wired here");
const mailBase = baseOf(MAIL, "the mailer base");
busBars(HTTP); busBars(REPO); busBars(MAIL);
cartridge(HTTP, "http", "handler · net/http + chi · decodes JSON, calls the service", "adapter.http", { baseShape: httpBase });
cartridge(REPO, "pg", "repository · database/sql · all the SQL lives here", "adapter.pg", { baseShape: repoBase });

{
  const rail = { x: -118, y: -42, w: 28, d: 74, r: 4 };
  put("rack", [rail.x + rail.w / 2, rail.y + rail.d / 2, 2.25],
    S(k.slabOf(rail, 0, 4.5, P, 5), { tone: "lo", crease: "none" }) + Ln(k.planOutline(k.insetPlan(rail, 3), 4.5, P, 5), { tone: "faint" }) +
    ringDots(k.corners(rail, 5).map(([x, y]) => at([x, y, 4.5])), 0.45),
    { bias: -0.8, label: "spare adapters · internal/repository — either one fits the same port", shapes: [record(A.slab(rail, 0, 4.5, { name: "rack" }, 5))] });
  const plinthShapes = [];
  for (const [slot, name] of [[SLOT_A, "A"], [SLOT_B, "B"]]) {
    const p = { n: REPO.n, t: REPO.t, outer: slot };
    const F = baseFrame(p, 4.5);
    const plinthPoly = rrect(24, 22, 3);
    const detail = [];
    detail.push(Ln([[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]].map(([u, v]) => G.circleOf(G.frameOf(at3(F, 10.05, u, v), [0, 0, 1], p.t, p.n), 0, 2.4, P, 12)).join(""), { tone: "faint" }));
    detail.push(Dots([[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]].map(([u, v]) => at(at3(F, 10.02, u, v))), { size: 0.55, tone: "lo" }));
    detail.push(Ln(G.circleOf(F, 10.05, 8.5, P, 20), { tone: "faint" }));
    const keyPts = rrect(4, 3, 1).map(([x, y]) => at3(F, 10.05, x - 10.5, y));
    detail.push(Ln(k.onTop(keyPts.map(([x, y]) => [x, y]), 10.05, P, true), { tone: "lo" }));
    const screwF = [[-10, -8], [10, -8]].map(([u, v]) => G.frameOf(at3(F, 10.05, u, v), [0, 0, 1], p.t, p.n));
    detail.push(Ln(screwF.map((f) => G.circleOf(f, 0, 1.6, P, 12)).join(""), { tone: "faint" }));
    detail.push(ringDots(screwF.map((f) => at(G.pointOf(f, 0, 0, 0))), 0.45));
    const plinth = record(A.prism(F, plinthPoly, 0, 5.5, { name: `rack.slot${name}` }));
    plinthShapes.push(plinth);
    put(`rack.slot${name}`, [slot[0], slot[1], 7.2], S(G.prismOf(F, plinthPoly, 0, 5.5, P), { tone: "mid" }) + detail.join(""), { bias: 0.12, shapes: [plinth] });
    const cheekPoly = rrect(2.6, 16, 0.8);
    // the two cheeks are separate items: one is nearer the viewer than the cartridge, one behind
    [-13.35, 13.35].forEach((u, i) => {
      put(`rack.slot${name}.${i ? "near" : "far"}`, [slot[0], slot[1], 9.5], S(G.prismOf(F, shiftPoly(cheekPoly, u, 0), 0, 10, P), { tone: "mid" }),
        { bias: 0.1, shapes: [record(A.prism(F, shiftPoly(cheekPoly, u, 0), 0, 10, { name: `rack.slot${name}.cheek` }))] });
    });
  }
  cartridge({ n: REPO.n, t: REPO.t, outer: SLOT_A }, "mem", "memory adapter · same interface, no database — this is what tests use", "adapter.mem", { baseShapes: plinthShapes });
}

// ---------------------------------------------------------------- client chain
{
  const relay = { x: -20, y: 62, w: 40, d: 22, r: 2.5 };
  const lid = Ln(k.planOutline(k.insetPlan(relay, 2.2), 18, P, 5), { tone: "faint" });
  const seam = Ln(k.sideSeam(relay, 13, P, 5), { tone: "faint" });
  put("relay", [0, relay.y + relay.d / 2, 9],
    S(k.slabOf(relay, 0, 18, P, 5, 0.8), { tone: "mid", inner: seam }) + lid +
    S(k.cylinder(-10, relay.y + relay.d / 2 - 2, 5.6, 18, 8, P, 24, 0.5), { tone: "hi" }) +
    Ln(k.knurl(-10, relay.y + relay.d / 2 - 2, 5.6, 18.06, 25.94, 18, P, 0.06), { tone: "lo" }) +
    Ln(k.ring(-10, relay.y + relay.d / 2 - 2, 4.2, 26, P, 18), { tone: "lo" }) +
    Ln([0, 1, 2].map((i) => k.ring(2 + i * 7, relay.y + relay.d, 1.6, 9, P, 10)).join(""), { tone: "faint" }) +
    Dots([2, 9, 16].map((x) => at([x, relay.y + relay.d, 9])), { size: 0.4, tone: "mid" }) +
    [12, 15].map((z) => Ln(k.segment([-16, relay.y + relay.d, z], [-2, relay.y + relay.d, z], P), { tone: "faint", free: true })).join(""),
    { bias: 0.5, label: "middleware · request id, log, auth — then the handler", shapes: [record(A.slab(relay, 0, 18, { name: "relay" }, 5)), record(A.cylinder(-10, relay.y + relay.d / 2 - 2, 5.6, 18, 8, { name: "relay.coil" }))] });

  const y0 = relay.y + relay.d, y1 = 98;
  const conduitF = G.frameAlong([0, y0, 7.5], [0, 1, 0]);
  const nut = (y) => S(G.prismOf(G.frameAlong([0, y, 7.5], [0, 1, 0]), Array.from({ length: 6 }, (_, i) => { const a = (30 + 60 * i) * DEG; return [2.9 * cos(a), 2.9 * sin(a)]; }), -1.2, 1.2, P), { tone: "mid" });
  put("conduit.client", [0, (y0 + y1) / 2, 7.5], S(G.disc(0, y1 - y0, 2.1, conduitF, P, { bevel: 0.3 }), { tone: "mid" }) + nut(y0 + 1.2) + nut(y1 - 1.2),
    { bias: 0.45, shapes: [record(A.disc(conduitF, 0, y1 - y0, 2.1, { name: "conduit.client" }))] });

  const box = { x: -16, y: 98, w: 32, d: 18, r: 2.5 };
  const boreF = G.frameAlong([0, box.y + box.d, 9], [0, 1, 0]);
  const bore = S(G.disc(0, 0.6, 5.6, boreF, P), { tone: "hi" }) + Ln(G.circleOf(boreF, 0.6, 5.6, P, 22), { tone: "hi" }) +
    Ln(G.circleOf(boreF, 0.7, 4.4, P, 20), { tone: "faint" }) + Dots([at([0, box.y + box.d + 0.7, 9])], { size: 0.9, tone: "faint" });
  put("client", [0, box.y + box.d / 2, 7],
    S(k.slabOf(box, 0, 14, P, 5, 0.8), { tone: "mid" }) + bore +
    [16, 19].map((z) => Ln(k.segment([-12, box.y + box.d, z], [-3, box.y + box.d, z], P), { tone: "faint", free: true })).join("") +
    ringDots([at([-11, box.y + box.d, 10]), at([11, box.y + box.d, 10])], 0.45),
    { bias: 0.5, label: "client · POST /users/register — the outside world", shapes: [record(A.slab(box, 0, 14, { name: "client" }, 5)), record(A.disc(boreF, 0, 0.6, 5.6, { name: "client.bore" }))] });
}

// ---------------------------------------------------------------- postgres block (30° frame)
const C_DB = [DRUM[0] + 115.4 * REPO.n[0], DRUM[1] + 115.4 * REPO.n[1]];
{
  const F = G.frameOf([C_DB[0], C_DB[1], 0], [0, 0, 1], REPO.t, REPO.n);
  const poly = [[-32, 0], [32, 0], [32, 40], [-32, 40]];
  const body = S(G.prismOf(F, poly, 0, 30, P), { tone: "mid" });
  const fins = Array.from({ length: 7 }, (_, i) => {
    const u = -27 + i * 9;
    return S(G.prismOf(F, [[u - 1.2, 0.6], [u + 1.2, 0.6], [u + 1.2, 39.4], [u - 1.2, 39.4]], 30, 36, P), { tone: "lo" });
  }).join("");
  const bossF = G.frameAlong([C_DB[0], C_DB[1], CABLE_Z], REPO.n);
  const boss = S(G.disc(-5, 0, 5.6, bossF, P, { bevel: 0.5 }), { tone: "hi" }) + Ln(G.circleOf(bossF, -5, 5.6, P, 22), { tone: "hi" }) +
    Ln(G.circleOf(bossF, -5, 4.4, P, 20), { tone: "faint" }) + Dots([[0, 4.4], [3.1, -3.1], [-3.1, -3.1]].map(([u, v]) => at(G.add3(G.pointOf(bossF, -5, 0, 0), G.add3(G.mul3(REPO.t, u), [0, 0, v])))), { size: 0.45, tone: "mid" });
  const rules = [22, 25].map((z) => Ln(k.segment(at3(F, 0, -12, z), at3(F, 0, 12, z), P), { tone: "faint", free: true })).join("");
  const ledF = G.frameAlong(at3(F, 0, 22, 12), REPO.n);
  const led = Ln(G.circleOf(ledF, 0, 2.4, P, 14), { tone: "hi" }) + Dots([at(G.pointOf(ledF, 0, 0, 0))], { size: 0.8, tone: "hi" });
  put("db", [C_DB[0] + 20 * REPO.n[0], C_DB[1] + 20 * REPO.n[1], 15], body + fins + boss + rules + led, {
    bias: 0.3, label: "postgres · the SQL adapter's client (db *sql.DB)",
    shapes: [record(A.prism(F, poly, 0, 30, { name: "db" })), record(A.disc(bossF, -5, 0, 5.6, { name: "db.boss" }))],
  });
}

// ---------------------------------------------------------------- mailbox (150° frame)
const C_MAIL = [DRUM[0] + 109.4 * MAIL.n[0], DRUM[1] + 109.4 * MAIL.n[1]];
let FLAG_PIVOT = [0, 0];
{
  const F = G.frameOf([C_MAIL[0], C_MAIL[1], 0], [0, 0, 1], MAIL.t, MAIL.n);
  const poly = [[-20, 0], [20, 0], [20, 34], [-20, 34]];
  const ring = poly.map(([u, v]) => G.pointOf(F, 14, u, v));
  const seam = Ln(k.onTop(ring.map((q) => [q[0], q[1]]), 14, P, true), { tone: "faint" });
  const body = S(G.prismOf(F, poly, 0, 20, P), { tone: "mid", inner: seam });
  // the -u side is the face the camera sees: slot plate, hinge, nameplate there
  const sideAt = (v, z) => at3(F, z, -20, v);
  const slotRing = [[7, 11.5], [29, 11.5], [29, 13.5], [7, 13.5]].map(([v, z]) => at(sideAt(v, z)));
  const slot = S(G.prismOf(F, [[-0.7, 6], [-0.7, 30], [0.7, 30], [0.7, 6]], 10, 14, P), { tone: "hi" }) +
    Ln(k.pathOf(slotRing, true), { tone: "faint" });
  const hinge = [17, 18.6].map((z) => Ln(k.segment(sideAt(0.05, z), sideAt(33.95, z), P), { tone: "faint" })).join("");
  const rules = [6, 7.6].map((z) => Ln(k.segment(sideAt(9, z), sideAt(23, z), P), { tone: "faint", free: true })).join("");
  const screws = [sideAt(4.5, 15.6), sideAt(29.5, 15.6)].map((q) => at(q));
  const bossF = G.frameAlong([C_MAIL[0], C_MAIL[1], CABLE_Z], MAIL.n);
  const boss = S(G.disc(-4, 0, 4.6, bossF, P, { bevel: 0.4 }), { tone: "hi" }) + Ln(G.circleOf(bossF, -4, 4.6, P, 20), { tone: "hi" }) + Ln(G.circleOf(bossF, -4, 3.5, P, 18), { tone: "faint" });
  put("mailbox", [C_MAIL[0] + 17 * MAIL.n[0], C_MAIL[1] + 17 * MAIL.n[1], 10], body + slot + hinge + rules + boss + ringDots(screws, 0.45), {
    bias: 0.3, label: "the world the mailer talks to",
    shapes: [record(A.prism(F, poly, 0, 20, { name: "mailbox" })), record(A.disc(bossF, -4, 0, 4.6, { name: "mailbox.boss" }))],
  });
  const postAt = G.pointOf(F, 20, -15, 4);
  const postShape = record(A.cylinder(postAt[0], postAt[1], 1.4, 20, 10, { name: "mailbox.post" }));
  put("mailbox.post", [postAt[0], postAt[1], 24],
    S(k.cylinder(postAt[0], postAt[1], 1.4, 20, 10, P, 14), { tone: "mid" }) + Dots([at([postAt[0], postAt[1], 30])], { size: 0.45, tone: "mid" }),
    { bias: 0.35, shapes: [postShape] });
  const pivot = [postAt[0], postAt[1], 29.4];
  const flagF = G.frameOf(pivot, MAIL.t, [0, 0, 1], MAIL.n);
  put("mailbox.flag", [pivot[0] + MAIL.t[0] * 4, pivot[1] + MAIL.t[1] * 4, 27.5],
    S(G.prismOf(flagF, shiftPoly(rrect(9, 5.4, 0.8), 4, -2.4), 0, 1, P), { tone: "hi" }),
    { bias: 0.4, label: "the mailer adapter flips this when it sends", shapes: [record(A.prism(flagF, shiftPoly(rrect(9, 5.4, 0.8), 4, -2.4), 0, 1, { name: "mailbox.flag", seated: true, cut: [postShape] }))] });
  FLAG_PIVOT = at(pivot);
}

// spare terminal strip + rating plate (right half of the bench)
{
  const strip = { x: 68, y: 2, w: 44, d: 16, r: 2.5 };
  const terms = [0, 1, 2].map((i) => [strip.x + 8 + i * 14, strip.y + 5]);
  const detail = terms.map(([x, y]) => Ln(k.ring(x, y, 2.2, 3, P, 12), { tone: "lo" }) + Ln(k.segment([x, y + 3, 3], [x, y + 9, 3], P), { tone: "faint", free: true })).join("");
  put("deck.strip", [strip.x + strip.w / 2, strip.y + strip.d / 2, 1.5],
    S(k.slabOf(strip, 0, 3, P, 4, 0.5), { tone: "lo", crease: "none" }) + Ln(k.planOutline(k.insetPlan(strip, 1.6), 3, P, 4), { tone: "faint" }) + detail +
    ringDots([...terms.map(([x, y]) => at([x, y, 3])), at([strip.x + 3, strip.y + 12]), at([strip.x + strip.w - 3, strip.y + 12])], 0.45),
    { bias: -0.9, label: "spare terminals — main.go is where the wiring happens", shapes: [record(A.slab(strip, 0, 3, { name: "deck.strip" }, 4))] });
  const rating = { x: 154, y: 102, w: 34, d: 13, r: 1.6 };
  put("deck.rating", [rating.x + rating.w / 2, rating.y + rating.d / 2, 0.8],
    S(k.slabOf(rating, 0, 0.8, P, 3), { tone: "lo", crease: "none" }) +
    [4, 6.2, 8.4].map((z) => Ln(k.segment([rating.x + 4, rating.y + rating.d, z], [rating.x + rating.w - 9 - z * 1.2, rating.y + rating.d, z], P), { tone: "faint", free: true })).join("") +
    ringDots([at([rating.x + rating.w - 4, rating.y + rating.d / 2, 0.8]), at([rating.x + 2.5, rating.y + rating.d / 2, 0.8])], 0.4),
    { bias: -0.9, shapes: [record(A.slab(rating, 0, 0.8, { name: "deck.rating" }, 3))] });
}

// ---------------------------------------------------------------- cables + cleats
const cleat = (name, centre, dir, label) => {
  const along = G.unit3(dir);
  const side = G.unit3(G.cross3([0, 0, 1], along));
  const feet = [-4.6, 4.6].map((d) => G.add3(centre, G.mul3(side, d)));
  feet.forEach((c, i) => {
    const plan = { x: c[0] - 1.7, y: c[1] - 1.7, w: 3.4, d: 3.4, r: 0.9 };
    put(`${name}.foot${i}`, [c[0], c[1], 4.1], S(k.slabOf(plan, 0, 8.2, P, 3), { tone: "mid" }),
      { bias: 0.2, shapes: [record(A.slab(plan, 0, 8.2, { name: `${name}.foot` }, 3))] });
  });
  const bridge = { x: centre[0] - 6.4, y: centre[1] - 3.4, w: 12.8, d: 6.8, r: 1.4 };
  put(name, [centre[0], centre[1], 9.5], S(k.slabOf(bridge, 8.2, 2.6, P, 4, 0.5), { tone: "mid" }) +
    Ln(k.planOutline(k.insetPlan(bridge, 1.2), 10.8, P, 4), { tone: "faint" }) + Dots([at([centre[0], centre[1], 10.8])], { size: 0.45, tone: "mid" }),
    { bias: 0.4, label, shapes: [record(A.slab(bridge, 8.2, 2.6, { name }, 4))] });
};

const ferrule = (name, p3, axis, label) => {
  const F = G.frameAlong(p3, axis);
  put(name, p3, S(G.disc(0, 2.4, 2.5, F, P, { bevel: 0.4 }), { tone: "mid" }) + Ln(G.circleOf(F, 2.4, 1.6, P, 12), { tone: "faint" }),
    { bias: 0.55, label, shapes: [record(A.disc(F, 0, 2.4, 2.5, { name }))] });
};

{
  // repository cable: base gland -> postgres boss, dead straight
  const a = alongPort(REPO, 69.5, CABLE_Z);     // just off the gland ferrule
  const b = alongPort(REPO, 110.3, CABLE_Z);    // just off the postgres boss face
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const cleatAt = alongPort(REPO, 92.4, CABLE_Z);
  const route = [[a[0], a[1], a[2]], [b[0], b[1], b[2]]];
  const total = G.pathLength(route);
  const repoShape = record(A.tube(route, 0.78, { name: "cable.repo", owner: "cable.repo" }));
  cable("cable.repo", route, 0.78, {
    label: "the repository cable: port base to postgres", ref: [mid[0], mid[1], CABLE_Z], tone: "hi",
    gaps: [[total / 2 - 3.5, total / 2 + 3.5]], rims: [2.5, 5.6],
  });
  ferrule("cable.repo.ferrule", alongPort(REPO, 67, CABLE_Z), REPO.n, "the strain relief on the port base");
  cleat("cleat.repo", cleatAt, REPO.n, "a cable cleat", repoShape);
  // mailer cable
  const ma = alongPort(MAIL, 69.5, CABLE_Z);
  const mb = alongPort(MAIL, 105.3, CABLE_Z);   // just off the mailbox boss face
  const mmid = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2];
  const mcleat = alongPort(MAIL, 89.4, CABLE_Z);
  const mroute = [[ma[0], ma[1], ma[2]], [mb[0], mb[1], mb[2]]];
  const mtotal = G.pathLength(mroute);
  const mailShape = record(A.tube(mroute, 0.72, { name: "cable.mail", owner: "cable.mail" }));
  cable("cable.mail", mroute, 0.72, {
    label: "the mailer cable", ref: [mmid[0], mmid[1], CABLE_Z], tone: "hi",
    gaps: [[mtotal / 2 - 3.3, mtotal / 2 + 3.3]], rims: [2.5, 4.6],
  });
  ferrule("cable.mail.ferrule", alongPort(MAIL, 67, CABLE_Z), MAIL.n, "the strain relief on the port base");
  cleat("cleat.mail", mcleat, MAIL.n, "a cable cleat", mailShape);
}

// ---------------------------------------------------------------- settle + audit
A.settle(R, P);
items.sort((a, b) => a.key - b.key);
A.auditOrExit(R, P, {});

// ---------------------------------------------------------------- overlay: glows, pulse, defs
const PULSE_MAIN = [
  [0, 116, 9], [0, 108, 12], [0, 92, 12], [0, 78, 20], [0, 64, 10], [0, 61.5, 8], [0, 52, 12],
  [0, 44, 12], [0, 41, 13], [0, 38, 16], [0, 33, 26], [0, 20, 44.6], [-12, 8, 45], [-12, -14, 45],
  [4, -22, 45], [24, -4, 45], [33, 12, 44], [34.6, 15, 26], [34.6, 15, 13], [36.4, 16, 12],
  [45.9, 21.5, 12], [53, 26, 9], [58.7, 28.9, 8], [78, 40.1, 7], [90, 46.9, 8], [95.6, 50.2, 7],
];
const PULSE_MAIL = [
  [-14, -2, 44.6], [-30, 8, 44.6], [-32.9, 14, 42], [-34.6, 15, 26], [-34.6, 15, 13], [-36.4, 16, 12],
  [-45.9, 21.5, 12], [-53, 26, 9], [-55.4, 27, 8], [-76.4, 39.1, 7], [-87, 45.5, 8], [-91.3, 47.7, 7],
];
const pulseLine = (pts) => G.fillet(pts, 2.4, 5, {});
const pulsePath = (pts) => k.pathOf(pulseLine(pts).map((q) => at(q)));
const marks = (() => {
  const line = pulseLine(PULSE_MAIN);
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]));
  const total = cum[cum.length - 1];
  const near = (p) => {
    let best = 0, bd = Infinity;
    line.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = i; } });
    return cum[best] / total;
  };
  return {
    total,
    client: 0,
    middleware: near(PULSE_MAIN[2]),
    handler: near(PULSE_MAIN[6]),
    service: near(PULSE_MAIN[8]),
    repo: near(PULSE_MAIN[17]),
    db: near(PULSE_MAIN[21]),
  };
})();

const glowEllipse = (cx, cy, rx, ry) => `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="var(--hex-glow)" filter="url(#hexBloom)"/>`;
const overlays = [];
{
  const defs = `<defs>
    <filter id="hexSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="hexPulse" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="1.7"/></filter>
    <filter id="hexBloom" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`;
  const collar = at([DRUM[0], DRUM[1], COLLAR_Z1]);
  overlays.push(`<g class="hex-glow" data-glow="core">${glowEllipse(collar[0], collar[1], 13 * KK, 6.5 * KK)}
    <ellipse cx="${collar[0].toFixed(1)}" cy="${collar[1].toFixed(1)}" rx="${(15.2 * KK).toFixed(1)}" ry="${(7.6 * KK).toFixed(1)}" fill="none" stroke="var(--hex-glow)" stroke-width="1.3" opacity="0.75"/>
    <ellipse cx="${collar[0].toFixed(1)}" cy="${collar[1].toFixed(1)}" rx="${(9.6 * KK).toFixed(1)}" ry="${(4.8 * KK).toFixed(1)}" fill="none" stroke="var(--hex-glow-soft)" stroke-width="0.9" opacity="0.6"/></g>`);
  // cartridge glows: built in the cartridge frame at rest; the live code translates them
  const cartGlow = (key, p) => {
    const o = at(world(p, 0, 0, 0));
    const u = screenVec(p.t), d = screenVec([0, 0, -1]);
    const m = `matrix(${u[0].toFixed(4)} ${u[1].toFixed(4)} ${d[0].toFixed(4)} ${d[1].toFixed(4)} 0 0)`;
    return `<g class="hex-glow" data-glow="${key}"><g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)}) ${m}"><rect x="-12.6" y="-35" width="25.2" height="26" rx="4" fill="var(--hex-glow)" filter="url(#hexSoft)" opacity="0.5"/><rect x="-12.6" y="-35" width="25.2" height="26" rx="4" fill="none" stroke="var(--hex-glow)" stroke-width="1.2"/></g></g>`;
  };
  overlays.push(cartGlow("http", HTTP), cartGlow("pg", REPO), cartGlow("mem", { n: REPO.n, t: REPO.t, outer: SLOT_A }), cartGlow("mail", MAIL));
  const lamp = (key, p3, r) => { const c = at(p3); return `<g class="hex-glow" data-glow="${key}">${glowEllipse(c[0], c[1], r * KK * 2.8, r * KK * 2.8)}<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(r * KK).toFixed(1)}" fill="var(--hex-glow)"/></g>`; };
  overlays.push(lamp("db", [C_DB[0] + REPO.t[0] * 22, C_DB[1] + REPO.t[1] * 22, 12], 2.6));
  overlays.push(lamp("mailbox", [-109.4, 46.9, 27], 2.2));
  overlays.push(lamp("relay", [-10, 73, 25], 3.2));
  overlays.push(lamp("client", [0, 116.6, 9], 3.4));
  overlays.push(`<path class="hex-pulse" data-pulse="main" d="${pulsePath(PULSE_MAIN)}"/>`);
  overlays.push(`<path class="hex-pulse" data-pulse="mail" d="${pulsePath(PULSE_MAIL)}"/>`);
  overlays.push(defs);
}

// ---------------------------------------------------------------- figure + page
const svg = k.figureSvg({
  width: W, height: H,
  label: "A bench rig for hexagonal architecture in a Go monorepo. A hexagonal core stands on a bench that is the repository. Three port bases stand in front of it, each holding an adapter cartridge: http, pg and mail. Cables run to a postgres block and a mailbox. Buttons send a request, swap the repository adapter for a memory cartridge, and run the tests.",
  body: [`<g class="hex-items">${items.map((item) => item.svg.replace("<g data-name=", `<g data-k="${item.key.toFixed(2)}" data-name=`)).join("")}</g>`, ...overlays],
});

const MOVERS = {
  pg: { shell: "adapter.pg", pins: "adapter.pg.pins", built: [REPO.outer[0], REPO.outer[1], 0], seated: [REPO.outer[0], REPO.outer[1], 0], park: [SLOT_B[0], SLOT_B[1], 0] },
  mem: { shell: "adapter.mem", pins: "adapter.mem.pins", built: [SLOT_A[0], SLOT_A[1], 0], seated: [REPO.outer[0], REPO.outer[1], 0], park: [SLOT_A[0], SLOT_A[1], 0] },
};

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Hexagonal architecture · Go monorepo",
  hint: "space send · s swap repo · t tests",
  readout: "ready · postgres adapter seated",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Bench rig for hexagonal architecture. Buttons: send a request, swap the repository adapter, run the tests.">${svg}</div>
  <div class="ctl-bar" role="group" aria-label="Actions">
    <button class="ctl" data-act="request">send request<kbd>space</kbd></button>
    <button class="ctl" data-act="swap">swap repository<kbd>s</kbd></button>
    <button class="ctl" data-act="tests">run tests<kbd>t</kbd></button>
  </div>`,
});

const STYLE = `<style>
.iso-page{margin:10px auto 14px}
html,body{overflow-x:hidden}
.iso{--hex-glow:#ff9440;--hex-glow-soft:#ffc08a;--anatomy-paper:#141414;--anatomy-face:#1f1f1f;--anatomy-top:#2b2b2b;--anatomy-shade-0:#0d0d0d;--anatomy-shade-1:#141414;--anatomy-shade-2:#1b1b1b;--anatomy-shade-3:#232323;--anatomy-hi:#e2e2e2;--anatomy-mid:#8a8a8a;--anatomy-lo:#4c4c4c;--anatomy-faint:#2e2e2e}
.ctl-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:20px;position:relative;z-index:1}
.ctl{appearance:none;font:10.5px/1 var(--anatomy-mono);letter-spacing:.09em;text-transform:uppercase;color:var(--anatomy-text);background:var(--anatomy-shade-1);border:1px solid var(--anatomy-lo);border-radius:7px;padding:10px 13px;cursor:pointer;transition:color .3s,border-color .3s,background .3s}
.ctl:hover{border-color:var(--anatomy-mid);color:var(--anatomy-strong)}
.ctl[data-on]{color:var(--hex-glow-soft);border-color:#7a4520;background:#231206}
.ctl[data-busy]{opacity:.55;cursor:default}
.ctl kbd{font:inherit;color:var(--anatomy-muted);margin-left:7px;letter-spacing:.04em}
.hex-glow{opacity:0;pointer-events:none}
.hex-pulse{fill:none;stroke:var(--hex-glow);stroke-width:3.4;stroke-linecap:round;filter:url(#hexPulse);pointer-events:none;opacity:0}
@media (max-width:560px){.iso-plate .iso-svg{width:112%;margin-left:-6%}}
.iso-plate-corner[data-corner="readout"]{max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iso-plate-corner[data-corner="hint"]{max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:560px){.iso-plate-corner[data-corner="readout"]{max-width:100%}.iso-plate-corner[data-corner="hint"]{max-width:100%}}
/* Embedded in a post: a top band holds the zoom control, the bottom band
   balances it. */
.iso-page{padding:0;margin:48px auto}
.iso-figure{margin:0}
/* Tighter plate: trim the empty band above and below the rig. The hint
   corner is redundant - the controls carry their own shortcut labels. */
.iso-plate{padding:22px 24px 34px}
.iso-plate-corner[data-corner="hint"]{display:none}
@media (max-width:560px){.iso-plate{padding:18px 12px 34px}.iso-plate-corner[data-corner="title"]{display:none}}
</style>`;

const live = `
const P = ${JSON.stringify(P)};
const V = ${JSON.stringify(V)};
const MOVERS = ${JSON.stringify(MOVERS)};
const AXIS = ${JSON.stringify([REPO.n[0], REPO.n[1]])};
const MARKS = ${JSON.stringify(marks)};
const FLAG_PIVOT = ${JSON.stringify(FLAG_PIVOT)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const buttons = [...document.querySelectorAll(".ctl")];

const layer = svg.querySelector(".hex-items");
const itemEls = [...layer.children].map((el) => ({ el, k: Number(el.dataset.k) || 0 }));
const movers = {};
for (const key of Object.keys(MOVERS)) {
  movers[key] = {
    els: [MOVERS[key].shell, MOVERS[key].pins].map((n) => layer.querySelector('[data-name="' + n + '"]')),
    glow: svg.querySelector('[data-glow="' + key + '"]'), pos: MOVERS[key].park.slice(),
  };
}
const glowEls = {};
for (const el of svg.querySelectorAll("[data-glow]")) glowEls[el.dataset.glow] = el;
const pulseMain = svg.querySelector('[data-pulse="main"]');
const pulseMail = svg.querySelector('[data-pulse="mail"]');
const flag = layer.querySelector('[data-name="mailbox.flag"]');
const lengths = { main: pulseMain.getTotalLength(), mail: pulseMail.getTotalLength() };

const state = {
  mode: "idle", busy: false, pending: null, u: 0, mailU: -1, pgSeated: true, memSeated: false,
  clock: 0, dt: 1 / 60, actionAt: 0, tour: 0, tourAt: 0, tourStep: 0, idle: 0, tests: 0,
  say: "", calm: still.matches, pulseOn: false, flag: 0, flagTarget: 0, hover: "",
  glows: {},
};
for (const key of Object.keys(glowEls)) state.glows[key] = { x: 0, target: 0 };
const follow = (s, target, dt, seconds) => { s.x += (target - s.x) * (1 - Math.exp(-dt / seconds)); return Math.abs(target - s.x) > 0.003; };
const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const say = (text) => { if (state.say !== text) { state.say = text; readout.textContent = text; } };
const setBusy = (on, which) => {
  state.busy = on;
  buttons.forEach((b) => {
    if (on) { b.setAttribute("data-busy", ""); if (b.dataset.act === which) b.setAttribute("data-on", ""); }
    else { b.removeAttribute("data-busy"); b.removeAttribute("data-on"); }
  });
};

const STAGES = [
  { at: 0, text: "client · POST /users/register", ms: "0.1 ms" },
  { at: MARKS.middleware, text: "middleware · request id, log, auth", ms: "0.2 ms" },
  { at: MARKS.handler, text: "handler · decode json", ms: "0.4 ms" },
  { at: MARKS.service, text: "service · email taken?", ms: "1.1 ms" },
  { at: MARKS.repo, text: "repo · INSERT INTO users", ms: "5.7 ms" },
  { at: 0.995, text: "postgres · 6.2 ms", ms: "6.2 ms" },
];
const STAGES_MEM = STAGES.map((s, i) => (i === 4 ? { at: s.at, text: "repo · write to a map", ms: "1.2 ms" } : i === 5 ? { at: 0.995, text: "memory · 1.3 ms", ms: "1.3 ms" } : s));
const MEM_STOP = MARKS.db - 0.03;

// ---- cartridge choreography
const LIFT = 28;
const lift = (p, z = LIFT) => [p[0], p[1], z];
// the carry runs around the front of the bench: staging -> out past the postgres block ->
// across the front -> back to the rack. Low enough to read as a carried part, clear of everything.
const CARRY = [[78, 62], [-24, 86], [-84, 64]];
function buildSwap(toMemory) {
  const axis = [AXIS[0] * 26, AXIS[1] * 26, 0];
  const out = [MOVERS.pg.seated[0] + axis[0], MOVERS.pg.seated[1] + axis[1], 0];
  const POSE = (from, to, start, dur) => ({ from, to, start, dur });
  // one cartridge leaving: out, lift, carry (3 legs), lower
  const leaving = (seated, home, t0) => [
    POSE(seated, out, t0, 0.45),
    POSE(out, lift(out), t0 + 0.4, 0.35),
    ...CARRY.map((w, i) => POSE(lift(i ? CARRY[i - 1] : out), lift(w), t0 + 0.7 + i * 0.38, 0.38)),
    POSE(lift(home), home, t0 + 0.7 + CARRY.length * 0.38, 0.35),
  ];
  // one arriving: lift, carry (3 legs reversed), lower, slide in
  const arriving = (home, t0) => [
    POSE(home, lift(home), t0, 0.35),
    ...[...CARRY].reverse().map((w, i) => POSE(lift(i ? [...CARRY].reverse()[i - 1] : home), lift(w), t0 + 0.32 + i * 0.38, 0.38)),
    POSE(lift(out), out, t0 + 0.32 + CARRY.length * 0.38, 0.35),
    POSE(out, MOVERS.pg.seated, t0 + 0.6 + CARRY.length * 0.38, 0.4),
  ];
  const seg = [], segMem = [];
  if (toMemory) {
    seg.push(...leaving(MOVERS.pg.seated, MOVERS.pg.park, 0));
    segMem.push(...arriving(MOVERS.mem.park, 2.75));
  } else {
    segMem.push(...leaving(MOVERS.mem.seated, MOVERS.mem.park, 0));
    seg.push(...arriving(MOVERS.pg.park, 2.75));
  }
  return { seg, segMem, toMemory, total: 5.4 };
}
let swap = null;
function poseAt(segs, t) {
  let last = segs[0].from;
  for (const s of segs) {
    if (t <= s.start) return last;
    const share = ease(s.start, s.start + s.dur, t);
    if (t <= s.start + s.dur) return [0, 1, 2].map((i) => s.from[i] + (s.to[i] - s.from[i]) * share);
    last = s.to;
  }
  return last;
}

// ---- actions
let tourTimer = 0;
// Auto-tour disabled: the rig only runs when a reader presses a control.
function scheduleTour() {
  clearTimeout(tourTimer);
}
const takeOver = () => { state.tour = 0; scheduleTour(); };
function startRequest(fromTour) {
  if (state.busy) return;
  if (!fromTour) takeOver();
  state.mode = "request"; setBusy(true, "request"); state.actionAt = state.clock; state.u = 0; state.mailU = -1;
  run();
}
function startSwap(toMemory, fromTour) {
  if (state.busy) return;
  if (!fromTour) takeOver();
  swap = buildSwap(toMemory ?? state.pgSeated);
  state.mode = "swap"; setBusy(true, "swap"); state.actionAt = state.clock;
  run();
}
function startTests(fromTour) {
  if (state.busy) return;
  if (state.pgSeated) { startSwap(true, fromTour); state.pending = "tests"; return; }  // arm first, then test
  if (!fromTour) takeOver();
  state.mode = "tests"; setBusy(true, "tests"); state.actionAt = state.clock; state.u = 0; state.tests = 0;
  run();
}
buttons.forEach((b) => b.addEventListener("click", () => { const a = b.dataset.act; if (a === "request") startRequest(); else if (a === "swap") startSwap(); else startTests(); stage.focus(); }));
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); startRequest(); }
  else if (event.key === "s" || event.key === "S") startSwap();
  else if (event.key === "t" || event.key === "T") startTests();
});
stage.addEventListener("pointermove", (event) => {
  const hit = event.target.closest ? event.target.closest("[data-label]") : null;
  state.hover = hit ? hit.getAttribute("data-label") : "";
  if (!state.busy && !state.tour) say(state.hover || readyText());
});
stage.addEventListener("pointerleave", () => { state.hover = ""; });
const readyText = () => (state.pgSeated ? "ready · postgres adapter seated" : "ready · memory adapter seated");

// ---- frame
function applyPose(key, pos) {
  const m = movers[key];
  m.pos = pos;
  const off = [pos[0] - MOVERS[key].built[0], pos[1] - MOVERS[key].built[1], pos[2] - MOVERS[key].built[2]];
  const transform = translateAlong(P, off);
  m.els.forEach((el) => el && el.setAttribute("transform", transform));
  if (m.glow) m.glow.setAttribute("transform", transform);
}
function sortItems() {
  const withKeys = itemEls.map((entry) => {
    let key = entry.k;
    for (const id of Object.keys(MOVERS)) {
      const m = movers[id];
      if (!m.els.includes(entry.el)) continue;
      // key follows the true depth change from where the item was built (what the audit settled),
      // never dropping below its settled key: the movers always ride ON the bench
      const delta = (m.pos[0] - MOVERS[id].built[0]) * V[0] + (m.pos[1] - MOVERS[id].built[1]) * V[1] + (m.pos[2] - MOVERS[id].built[2]) * V[2];
      key = Math.max(entry.k + delta, entry.k);
    }
    return { el: entry.el, key };
  }).sort((a, b) => a.key - b.key);
  const want = withKeys.map((w) => w.el);
  const have = [...layer.children];
  if (want.some((el, i) => el !== have[i])) {
    const frag = document.createDocumentFragment();
    want.forEach((el) => frag.appendChild(el));
    layer.appendChild(frag);
  }
}
function glow(key, target) { const g = state.glows[key]; if (!g) return false; g.target = target; return follow(g, target, state.dt, 0.22); }
function draw() {
  const dt = state.dt;
  let moving = false;
  // cartridges
  if (state.mode === "swap" && swap) {
    const t = state.clock - state.actionAt;
    if (state.calm) {
      applyPose("pg", swap.toMemory ? MOVERS.pg.park : MOVERS.pg.seated);
      applyPose("mem", swap.toMemory ? MOVERS.mem.seated : MOVERS.mem.park);
      state.pgSeated = !swap.toMemory; state.memSeated = swap.toMemory;
      state.mode = "idle"; setBusy(false);
      if (state.pending === "tests") { state.pending = null; startTests(); }
      return true;
    }
    applyPose("pg", poseAt(swap.seg, t));
    applyPose("mem", poseAt(swap.segMem, t));
    sortItems();
    moving = true;
    say(swap.toMemory ? "repo adapter: pg → mem · the same interface, no database" : "repo adapter: mem → pg · all the SQL lives here");
    if (t >= swap.total) {
      state.pgSeated = !swap.toMemory; state.memSeated = swap.toMemory;
      state.mode = "idle"; setBusy(false);
      if (state.pending === "tests") { state.pending = null; startTests(); }
      else say(readyText());
    }
  }
  // pulse
  let pulseOpacity = 0;
  if (state.mode === "request" || state.mode === "tests") {
    const t = state.clock - state.actionAt;
    const testing = state.mode === "tests";
    const dur = testing ? 1.5 : 2.9;
    const u = Math.min(1, t / dur);
    const phase = state.calm ? Math.round(u * 6) / 6 : (u > 0.62 ? 1 - (u - 0.62) / 0.38 : u);
    state.u = Math.min(phase, 0.995);
    const uu = state.u * (state.memSeated ? MEM_STOP / 0.9 : 1);
    const dash = 34;
    pulseMain.style.strokeDasharray = dash + " " + lengths.main;
    pulseMain.style.strokeDashoffset = String(-Math.max(0, Math.min(1, uu)) * (lengths.main - dash));
    pulseOpacity = u > 0.62 ? 0.45 : 0.95;
    state.pulseOn = true;
    const table = state.memSeated ? STAGES_MEM : STAGES;
    let stageNow = table[0];
    for (const s of table) if (uu >= s.at - 0.02) stageNow = s;
    if (testing) {
      const done = Math.floor(t / 0.5);
      say(done < 3 ? "go test ./internal/service · " + (done + 1) + "/3" : "ok · 12 tests · 0.021 s");
    } else if (u > 0.62) say("← 201 Created · user #1041 · " + stageNow.ms);
    else say(stageNow.text + " · " + stageNow.ms);
    if (u > 0.45 && state.mailU < 0) state.mailU = 0;
    const coreOn = uu > MARKS.handler - 0.03 && uu < MARKS.repo + 0.05 ? 1 : 0;
    moving = glow("core", coreOn) || moving;
    moving = glow("http", uu > MARKS.handler - 0.04 && uu < MARKS.service ? 1 : 0) || moving;
    moving = glow(state.memSeated ? "mem" : "pg", uu > MARKS.repo - 0.03 && uu < (state.memSeated ? MEM_STOP + 0.02 : MARKS.db + 0.02) ? 1 : 0) || moving;
    moving = glow("db", !state.memSeated && uu > MARKS.repo + 0.04 && uu < 0.99 ? 1 : 0) || moving;
    moving = glow("relay", uu > MARKS.middleware - 0.04 && uu < MARKS.handler ? 1 : 0) || moving;
    moving = glow("client", uu < 0.06 || u > 0.97 ? 1 : 0) || moving;
    if (u >= 1) {
      state.mode = "idle"; setBusy(false); state.pulseOn = false;
      if (testing) say("ok · 12 tests · 0.021 s · no database");
      else say(state.memSeated ? "201 Created · user #1041 · 1.3 ms · mail sent" : "201 Created · user #1041 · 6.2 ms · mail sent");
    }
  } else {
    state.pulseOn = false;
    for (const key of ["core", "http", "pg", "mem", "db", "mail", "relay", "client"]) moving = glow(key, 0) || moving;
  }
  pulseMain.style.opacity = state.pulseOn ? String(pulseOpacity) : "0";
  // mailer pulse
  if (state.mailU >= 0) {
    state.mailU += dt / 1.5;
    const u = Math.min(1, state.mailU);
    const dash = 26;
    pulseMail.style.strokeDasharray = dash + " " + lengths.mail;
    pulseMail.style.strokeDashoffset = String(-u * (lengths.mail - dash));
    pulseMail.style.opacity = String(Math.max(0, 0.9 * (1 - u * 0.4)));
    state.flagTarget = 1;
    moving = glow("mail", u > 0.25 && u < 1 ? 1 : 0) || moving;
    moving = glow("mailbox", u > 0.8 ? 1 : 0) || moving;
    if (u >= 1) { state.mailU = -1; pulseMail.style.opacity = "0"; }
  } else {
    moving = glow("mail", 0) || moving;
    moving = glow("mailbox", 0) || moving;
    if (state.mode === "idle" && !state.busy) state.flagTarget = 0;
  }
  if (state.flag !== state.flagTarget) {
    state.flag += (state.flagTarget - state.flag) * (1 - Math.exp(-dt / 0.3));
    if (Math.abs(state.flagTarget - state.flag) < 0.01) state.flag = state.flagTarget;
    moving = true;
  }
  flag.setAttribute("transform", state.flag ? "rotate(" + (-58 * state.flag).toFixed(1) + " " + FLAG_PIVOT[0].toFixed(1) + " " + FLAG_PIVOT[1].toFixed(1) + ")" : "");
  // write glows
  for (const key of Object.keys(glowEls)) {
    const g = state.glows[key];
    glowEls[key].style.opacity = (state.calm ? g.target : g.x).toFixed(3);
  }
  return moving || state.pulseOn || state.mailU >= 0 || (state.tour && !state.busy);
}
let frame = 0, last = 0, visible = true;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  state.clock += dt; state.dt = dt; state.calm = still.matches;
  if (!state.busy && !state.tour) { state.idle += dt; }
  if (state.tour && !state.busy) {
    const steps = ["request", "request", "request"];
    const i = state.tourStep % steps.length;
    const at = state.clock - state.tourAt;
    if (at > (i === 0 ? 0.05 : 5.6)) {
      state.tourAt = state.clock; state.tourStep = i + 1;
      const act = steps[i];
      if (act === "request") startRequest(true);
      else if (act === "swap") startSwap(undefined, true);
      else startTests(true);
    }
  }
  const moving = draw();
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
window.__hex = { state, movers, say, P, iso, sortItems };
if (still.matches) state.tour = 0;
else scheduleTour();
draw();
run();
`;

const html = k.pageHtml({
  title: "Hexagonal architecture in a Go monorepo",
  theme: "dark",
  width: 720,
  body: body + STYLE,
  script: kitScript() + live,
});
writeFileSync(join(HERE, "hexagonal-go.html"), html);
console.log("wrote", join(HERE, "hexagonal-go.html"), "· items", items.length, "· solids", R.solids.length, "· tubes", R.tubes.length);

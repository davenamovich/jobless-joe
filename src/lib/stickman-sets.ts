/**
 * Stickman sets — the ink-drawn places and big items behind and beside Joe
 * in the song video (see stickman-scenes.ts for which line gets which).
 * Same 500×420 stage as the figure, ground at y = 392. Set lines are drawn
 * faint so Joe stays the thing you look at; items are solid.
 */

import type { SceneItem, SceneSet } from "./stickman-scenes";

const GROUND = 392;

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const line = (d: string, cls = "") => `<path d="${d}" class="sm-sl${cls ? " " + cls : ""}"/>`;
const box = (x: number, y: number, w: number, h: number, rx = 4, fill = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="sm-sl"${fill ? ` style="fill:${fill}"` : ""}/>`;
const txt = (x: number, y: number, size: number, s: string, fill = "var(--sm-ink)") =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="${size}" letter-spacing="1" fill="${fill}">${esc(s)}</text>`;
const star = (x: number, y: number, r: number, delay: number) =>
  `<path d="M${x} ${y - r} L${x + r * 0.25} ${y - r * 0.25} L${x + r} ${y} L${x + r * 0.25} ${y + r * 0.25} L${x} ${y + r} L${x - r * 0.25} ${y + r * 0.25} L${x - r} ${y} L${x - r * 0.25} ${y - r * 0.25} Z" fill="#f6ecda" class="sm-twinkle" style="animation-delay:${delay}ms"/>`;

function washers(): string {
  let s = "";
  for (let i = 0; i < 7; i++) {
    const x = 14 + i * 68;
    s += box(x, 300, 60, 92, 5) + `<circle cx="${x + 30}" cy="352" r="19" class="sm-sl"/>` + line(`M${x + 6} 316 H${x + 54}`);
  }
  return s;
}

function skyline(): string {
  const b: Array<[number, number, number]> = [
    [8, 60, 196], [72, 46, 136], [122, 64, 236], [196, 108, 92], [318, 54, 176], [376, 44, 124], [424, 66, 214],
  ];
  let s = "";
  for (const [x, w, h] of b) {
    const top = GROUND - h;
    s += box(x, top, w, h, 2);
    for (let wy = top + 14; wy < GROUND - 20; wy += 22)
      for (let wx = x + 9; wx < x + w - 10; wx += 16)
        if ((wx * 7 + wy * 3) % 5 < 2) s += `<rect x="${wx}" y="${wy}" width="7" height="9" fill="#e9c46a" opacity=".55"/>`;
  }
  return s;
}

function rainfall(): string {
  let s = "";
  for (let i = 0; i < 22; i++) {
    const x = 14 + ((i * 37) % 472);
    const y = 70 + ((i * 53) % 260);
    s += `<path d="M${x} ${y} l-5 16" class="sm-sl sm-rainfall" style="animation-delay:${(i * 97) % 700}ms"/>`;
  }
  return s;
}

const CLOUD = (cx: number, cy: number, k: number, fill: string) =>
  `<path transform="translate(${cx} ${cy}) scale(${k})" d="M-42 10 Q-58 10 -54 -4 Q-50 -18 -34 -14 Q-26 -30 -8 -24 Q6 -34 18 -18 Q38 -18 34 -2 Q34 10 18 10 Z" style="fill:${fill}" class="sm-sl sm-solid"/>`;

/** The backdrop markup for each set (empty for the bare stage). */
export const SET_SVG: Record<SceneSet, string> = {
  stage: "",
  office:
    box(330, 60, 130, 120, 4) + line("M395 60 V180 M330 120 H460") +
    line("M338 180 V152 H356 V140 H372 V180 M402 180 V148 H420 V160 H436 V132 H452 V180", "sm-faint") +
    box(18, 262, 120, 130, 3) +
    `<rect x="34" y="282" width="26" height="30" fill="#e9c46a" opacity=".5"/><rect x="74" y="292" width="30" height="22" fill="#9ad1c8" opacity=".45"/>` +
    line("M250 0 V24") + `<path d="M222 44 Q250 14 278 44 Z" class="sm-sl" style="fill:#fde68a;fill-opacity:.25"/>` +
    `<path d="M452 392 L446 354 H486 L480 392 Z" class="sm-sl" style="fill:#7a5134;fill-opacity:.6"/>` +
    line("M466 354 Q446 322 456 302 M466 354 Q470 318 486 304 M466 354 Q482 336 496 332"),
  laundromat:
    line("M190 0 V18 M310 0 V18") +
    `<rect x="170" y="18" width="160" height="34" rx="6" fill="#b8434f" opacity=".85"/>` + txt(250, 41, 16, "WASH & FOLD", "#f6ecda") +
    washers(),
  interview:
    // HR behind a desk, glasses on, unimpressed.
    `<g class="sm-solid">` +
    `<circle cx="410" cy="232" r="22" class="sm-ink sm-thin sm-paper"/>` +
    `<circle cx="402" cy="229" r="6" fill="none" class="sm-ink sm-mesh2"/><circle cx="418" cy="229" r="6" fill="none" class="sm-ink sm-mesh2"/>` +
    `<circle cx="402" cy="229" r="2.4" class="sm-dot"/><circle cx="418" cy="229" r="2.4" class="sm-dot"/>` +
    `<path d="M403 242 H417" fill="none" class="sm-ink sm-thin"/>` +
    `<path d="M410 254 V300 M410 268 L386 290 L366 300 M410 268 L434 290 L452 300" fill="none" class="sm-ink sm-thin"/>` +
    `<rect x="326" y="300" width="152" height="92" fill="#3b2622" class="sm-ink sm-thin"/>` +
    `<path d="M318 300 H486" fill="none" class="sm-ink"/>` +
    `<rect x="350" y="284" width="42" height="15" rx="2" fill="#d3a85f"/>` + txt(371, 296, 11, "HR", "#201414") +
    `</g>`,
  jobfair:
    line("M60 0 L92 24 M440 0 L408 24") +
    `<rect x="92" y="22" width="316" height="40" rx="4" fill="#5fb3a8" opacity=".8"/>` + txt(250, 50, 22, "JOB FAIR", "#102520") +
    `<rect x="10" y="330" width="122" height="62" fill="#b8434f" opacity=".5"/>` + box(10, 330, 122, 62, 0) +
    line("M38 330 V276") + `<rect x="14" y="252" width="56" height="26" rx="3" fill="#f6ecda" opacity=".75"/>` + txt(42, 270, 12, "HIRING*", "#201414") +
    `<rect x="368" y="330" width="122" height="62" fill="#5fb3a8" opacity=".4"/>` + box(368, 330, 122, 62, 0) +
    line("M470 330 L468 262 M484 330 L488 248") + `<circle cx="468" cy="252" r="12" fill="#b8434f" opacity=".8"/><circle cx="488" cy="238" r="12" fill="#e9c46a" opacity=".8"/>`,
  videocall:
    `<rect x="26" y="26" width="448" height="302" rx="14" class="sm-sl" style="fill:rgba(0,0,0,.28)"/>` +
    `<circle cx="250" cy="38" r="5" fill="#f6ecda" opacity=".7"/>` +
    `<circle cx="52" cy="54" r="6" fill="#ef4444" class="sm-blink"/>` + txt(80, 59, 13, "REC", "#ef4444") +
    `<rect x="384" y="46" width="76" height="54" rx="6" class="sm-sl" style="fill:rgba(255,255,255,.06)"/>` +
    `<circle cx="422" cy="66" r="9" class="sm-sl"/>` + line("M422 75 V100 M406 100 Q422 84 438 100") +
    `<rect x="174" y="298" width="152" height="22" rx="11" fill="rgba(0,0,0,.5)"/>` +
    `<circle cx="206" cy="309" r="6" fill="#f6ecda" opacity=".7"/><circle cx="250" cy="309" r="6" fill="#f6ecda" opacity=".7"/><circle cx="294" cy="309" r="6" fill="#ef4444"/>`,
  night:
    `<path d="M408.7 40 A40 40 0 1 0 446.4 96.6 A34 34 0 0 1 408.7 40 Z" fill="#f3e3b0" class="sm-moon"/>` +
    star(60, 60, 7, 0) + star(132, 118, 5, 400) + star(196, 38, 6, 900) + star(318, 84, 5, 300) +
    star(346, 28, 7, 1200) + star(470, 168, 6, 700) + star(36, 200, 5, 1500) + star(318, 176, 4, 1100) +
    line("M8 360 Q120 330 230 352 Q360 376 492 340", "sm-faint"),
  city: skyline() + line("M470 392 V252 Q470 238 456 238") + `<circle cx="454" cy="244" r="7" fill="#fde68a" class="sm-glow"/>`,
  rain:
    CLOUD(110, 36, 1.5, "#6b7280") + CLOUD(270, 28, 1.8, "#596170") + CLOUD(430, 44, 1.5, "#6b7280") +
    rainfall() + `<ellipse cx="392" cy="394" rx="62" ry="6" class="sm-sl"/>`,
  home:
    box(30, 70, 110, 100, 3) + line("M85 70 V170 M30 120 H140") + line("M22 62 Q40 120 26 182 M148 62 Q130 120 144 182", "sm-faint") +
    `<rect x="14" y="300" width="150" height="54" rx="14" class="sm-sl" style="fill:#7d343d;fill-opacity:.55"/>` +
    `<rect x="14" y="340" width="150" height="34" rx="8" class="sm-sl" style="fill:#7d343d;fill-opacity:.7"/>` +
    line("M28 374 V392 M150 374 V392") +
    `<rect x="360" y="250" width="110" height="74" rx="6" class="sm-sl" style="fill:rgba(160,200,255,.12)"/>` +
    line("M415 324 V392 M390 392 H440 M400 250 L384 222 M430 250 L446 222"),
};

/** Where Joe and the item stand: an item takes the right of the stage (the left at the HR desk). */
export function sceneLayout(set: SceneSet | undefined, hasItem: boolean, sideProp: boolean): { cx: number; itemX: number } {
  if (set === "interview") return { cx: hasItem ? 226 : 214, itemX: 76 };
  if (hasItem) return { cx: 178, itemX: 388 };
  return { cx: sideProp ? 200 : 250, itemX: 388 };
}

/** A sign's words on one line, or two balanced lines when long. */
export function signLines(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (label.length <= 12 || words.length < 2) return [label];
  let best = [label, ""];
  let worst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (Math.max(a.length, b.length) < worst) {
      worst = Math.max(a.length, b.length);
      best = [a, b];
    }
  }
  return best;
}

function fitText(label: string, width: number, max: number): number {
  return Math.max(10, Math.min(max, Math.floor(width / Math.max(1, label.length * 0.68))));
}

/**
 * A big item's markup in stage coordinates. x = where it stands, cx = Joe
 * (thrown pages leave his hand, money rains on him).
 */
export function itemSvg(item: SceneItem, x: number, cx: number, label?: string): string {
  switch (item) {
    case "papers": {
      // Résumés leaving his throwing hand toward the top of the stage.
      const hx = cx + 82;
      const hy = 108;
      const dx = Math.max(160, 470 - hx);
      let s = "";
      for (let i = 0; i < 4; i++) {
        s +=
          `<g class="sm-fly" style="--dx:${dx - i * 18}px;--dy:${-92 + i * 14}px;--r:${(i % 2 ? -1 : 1) * 200}deg;animation-delay:${i * 380}ms">` +
          `<g transform="translate(${hx} ${hy})"><rect x="-10" y="-13" width="20" height="26" rx="1.5" class="sm-ink sm-thin sm-paper"/>` +
          `<path d="M-6 -6 H6 M-6 0 H6 M-6 6 H3" fill="none" class="sm-ink sm-hair"/></g></g>`;
      }
      return s;
    }
    case "washer": {
      const tape = label
        ? `<g transform="rotate(-9 ${x} 346)"><rect x="${x - 50}" y="334" width="100" height="24" fill="#fde68a"/>${txt(x, 351, fitText(label, 92, 13), label, "#201414")}</g>`
        : "";
      return (
        `<rect x="${x - 56}" y="276" width="112" height="116" rx="8" class="sm-ink sm-paper"/>` +
        `<path d="M${x - 56} 300 H${x + 56}" fill="none" class="sm-ink sm-thin"/>` +
        `<circle cx="${x - 38}" cy="288" r="4" class="sm-dot"/><circle cx="${x - 24}" cy="288" r="4" class="sm-dot"/>` +
        `<rect x="${x + 10}" y="283" width="34" height="10" rx="2" fill="#5fb3a8"/>` +
        `<circle cx="${x}" cy="346" r="34" fill="none" class="sm-ink"/><circle cx="${x}" cy="346" r="26" fill="#9ad1c8" fill-opacity=".45"/>` +
        `<g class="sm-spin" style="transform-origin:${x}px 346px"><path d="M${x - 16} 346 Q${x} 328 ${x + 16} 346 M${x - 8} 356 L${x + 10} 360" fill="none" class="sm-ink sm-thin" style="stroke:#b8434f"/></g>` +
        tape
      );
    }
    case "webcam":
      return (
        `<path d="M${x} 300 L${x - 34} ${GROUND} M${x} 300 L${x + 34} ${GROUND} M${x} 300 V${GROUND}" fill="none" class="sm-ink sm-thin"/>` +
        `<rect x="${x - 40}" y="258" width="64" height="44" rx="6" fill="#4b5563" class="sm-ink sm-thin"/>` +
        `<circle cx="${x - 46}" cy="280" r="15" fill="#1f2937" class="sm-ink sm-thin"/><circle cx="${x - 46}" cy="280" r="6" fill="#60a5fa"/>` +
        `<circle cx="${x + 14}" cy="268" r="4.5" fill="#ef4444" class="sm-blink"/>` +
        `<path d="M${x - 60} 270 L${x - 150} 230 M${x - 60} 290 L${x - 150} 330" fill="none" class="sm-ink sm-hair sm-faint"/>`
      );
    case "clock": {
      const cy = 128;
      let ticks = "";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r1 = i % 3 ? 38 : 33;
        ticks += `M${(x + Math.sin(a) * r1).toFixed(1)} ${(cy - Math.cos(a) * r1).toFixed(1)} L${(x + Math.sin(a) * 42).toFixed(1)} ${(cy - Math.cos(a) * 42).toFixed(1)} `;
      }
      return (
        `<circle cx="${x}" cy="${cy}" r="48" class="sm-ink sm-paper"/>` +
        `<path d="${ticks}" fill="none" class="sm-ink sm-hair"/>` +
        `<path d="M${x} ${cy} L${x + 18} ${cy + 8}" fill="none" class="sm-ink"/>` +
        `<g class="sm-spin sm-fast" style="transform-origin:${x}px ${cy}px"><path d="M${x} ${cy} L${x} ${cy - 34}" fill="none" class="sm-ink sm-thin" style="stroke:#b8434f"/></g>` +
        `<circle cx="${x}" cy="${cy}" r="4" class="sm-dot"/>`
      );
    }
    case "robot":
      return (
        `<g class="sm-hover">` +
        `<path d="M${x} 222 V204" fill="none" class="sm-ink sm-thin"/><circle cx="${x}" cy="200" r="5" fill="#ef4444" class="sm-blink"/>` +
        `<rect x="${x - 28}" y="222" width="56" height="44" rx="8" fill="#9ca3af" class="sm-ink sm-thin"/>` +
        `<rect x="${x - 20}" y="232" width="40" height="22" rx="4" fill="#111827"/>` +
        `<circle cx="${x - 9}" cy="243" r="4" fill="#5fb3a8" class="sm-blink"/><circle cx="${x + 9}" cy="243" r="4" fill="#5fb3a8" class="sm-blink"/>` +
        `<rect x="${x - 36}" y="272" width="72" height="70" rx="8" fill="#9ca3af" class="sm-ink sm-thin"/>` +
        `<circle cx="${x}" cy="296" r="8" fill="#fde68a" class="sm-glow"/>` +
        `<path d="M${x - 36} 284 L${x - 58} 318 M${x + 36} 284 L${x + 58} 260" fill="none" class="sm-ink sm-thin"/>` +
        `<path d="M${x - 16} 342 V${GROUND} M${x + 16} 342 V${GROUND}" fill="none" class="sm-ink"/>` +
        txt(x, 334, 12, "A.I.", "#201414") +
        `</g>`
      );
    case "invoice": {
      const amount = label || "$$$";
      return (
        `<path d="M${x - 30} 334 L${x - 46} ${GROUND} M${x + 30} 334 L${x + 46} ${GROUND}" fill="none" class="sm-ink sm-thin"/>` +
        `<g transform="rotate(4 ${x} 266)">` +
        `<rect x="${x - 54}" y="190" width="108" height="148" rx="3" class="sm-ink sm-thin sm-paper"/>` +
        txt(x, 214, 15, "INVOICE") +
        `<path d="M${x - 40} 230 H${x + 40} M${x - 40} 244 H${x + 26} M${x - 40} 258 H${x + 36}" fill="none" class="sm-ink sm-hair"/>` +
        txt(x, 292, fitText(amount, 96, 22), amount, "#d3a85f") +
        `<g transform="rotate(-16 ${x + 16} 318)"><rect x="${x - 14}" y="306" width="60" height="22" rx="3" fill="none" stroke="#ef4444" stroke-width="3"/>${txt(x + 16, 323, 14, "DUE", "#ef4444")}</g>` +
        `</g>`
      );
    }
    case "sign": {
      const lines = signLines(label || "HIRE ME");
      const size = fitText(lines.reduce((a, b) => (b.length > a.length ? b : a)), 120, lines.length > 1 ? 20 : 26);
      const words =
        lines.length > 1
          ? txt(x, 222, size, lines[0], "#201414") + txt(x, 224 + size + 2, size, lines[1], "#201414")
          : txt(x, 234, size, lines[0], "#201414");
      return (
        `<path d="M${x} ${GROUND} V258" fill="none" class="sm-ink"/>` +
        `<g class="sm-swing" style="transform-origin:${x}px 258px">` +
        `<rect x="${x - 66}" y="194" width="132" height="64" rx="6" fill="#fde68a" class="sm-ink sm-thin"/>` +
        words +
        `</g>`
      );
    }
    case "money": {
      let s = "";
      for (let i = 0; i < 9; i++) {
        const bx = cx - 140 + ((i * 71) % 280);
        s +=
          `<g class="sm-fall" style="animation-delay:${(i * 230) % 1500}ms;--r:${i % 2 ? 30 : -30}deg">` +
          `<g transform="translate(${bx} -20)"><rect x="-17" y="-9" width="34" height="18" rx="2" fill="#7fb069" class="sm-ink sm-hair"/>${txt(0, 5, 12, "$", "#1f3a14")}</g></g>`;
      }
      return s;
    }
    case "door":
      return (
        `<rect x="${x - 34}" y="190" width="68" height="22" rx="3" fill="#16a34a"/>` + txt(x, 207, 14, "EXIT", "#f6ffef") +
        `<rect x="${x - 44}" y="220" width="88" height="172" fill="#2a1b17" class="sm-ink sm-thin"/>` +
        `<path d="M${x - 40} 224 L${x + 18} 236 L${x + 18} ${GROUND - 6} L${x - 40} ${GROUND}" fill="#7a5134" class="sm-ink sm-thin"/>` +
        `<circle cx="${x + 8}" cy="312" r="4" fill="#d3a85f"/>` +
        `<path d="M${x + 18} 236 L${x + 40} 224 L${x + 40} ${GROUND} L${x + 18} ${GROUND - 6} Z" fill="#fde68a" opacity=".35"/>`
      );
  }
}

/** Set + item styles and loops. Joins RIG_CSS on the video page. */
export const SCENE_CSS = `
.sm-sl{fill:none;stroke:var(--sm-ink);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.42}
.sm-sl.sm-solid{opacity:.95}
.sm-faint{opacity:.25}
.sm-hair{stroke-width:2}
.sm-mesh2{stroke-width:2}
.sm-set{transition:opacity .6s ease}
.sm-set.sm-in{animation:sm-setin .7s ease both}
.sm-set.sm-out{opacity:0}
@keyframes sm-setin{from{opacity:0}to{opacity:1}}
.sm-moon{filter:drop-shadow(0 0 14px rgba(243,227,176,.55))}
.sm-twinkle{transform-box:fill-box;transform-origin:50% 50%;animation:sm-twinkle 1.8s ease-in-out infinite}
@keyframes sm-twinkle{50%{transform:scale(.45);opacity:.5}}
.sm-blink{animation:sm-blink 1s steps(2,jump-none) infinite}
@keyframes sm-blink{50%{opacity:.15}}
.sm-spin{transform-box:view-box;animation:sm-spin 1.1s linear infinite}
.sm-spin.sm-fast{animation-duration:2.4s}
@keyframes sm-spin{to{transform:rotate(360deg)}}
.sm-rainfall{animation:sm-rainfall .7s linear infinite}
@keyframes sm-rainfall{from{transform:translateY(-10px);opacity:0}30%{opacity:.8}to{transform:translateY(26px);opacity:0}}
.sm-fly{animation:sm-fly 1.6s cubic-bezier(.25,.6,.5,1) infinite both}
@keyframes sm-fly{from{transform:translate(0,0) rotate(0);opacity:1}85%{opacity:1}to{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
.sm-fall{animation:sm-fall 2.2s linear infinite both}
@keyframes sm-fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(430px) rotate(var(--r))}}
.sm-swing{transform-box:view-box;animation:sm-swing 2.6s ease-in-out infinite alternate}
@keyframes sm-swing{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
.sm-hover{animation:sm-hover 1.6s ease-in-out infinite alternate}
@keyframes sm-hover{to{transform:translateY(-6px)}}
.sm-rim{font:900 30px/1 ui-sans-serif,system-ui,sans-serif;fill:var(--sm-accent);letter-spacing:.06em;transform-box:fill-box;transform-origin:50% 50%;animation:sm-rim .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes sm-rim{from{transform:scale(0) rotate(-12deg);opacity:0}to{transform:rotate(-6deg);opacity:1}}
`;

/**
 * Joe's TV — a wall-mounted telly on the stickman video stage that flips to a
 * new "corporate deck" slide on every lyric line: charts and stats about
 * whatever Joe is singing (application funnels, robots vs Joe, bank balance
 * crashing, coffee intake…). A title card shows during the intro.
 *
 * Like the beats, slides come from the lyric lines themselves (keyword →
 * slide), seeded by the line's text so a repeated chorus line shows the same
 * slide. Server side renders every slide to SVG; TV_JS only swaps them in on
 * the page's clock, so it films the same in P&R's recorder as in a browser.
 */

import { beatStarts, type StickmanBeat } from "./stickman";

export type TvSlide =
  | { kind: "title"; title: string; sub: string }
  | { kind: "bars"; title: string; labels: string[]; values: number[]; hot: number }
  | { kind: "line"; title: string; names: string[]; series: number[][] }
  | { kind: "pie"; title: string; labels: string[]; values: number[] }
  | { kind: "bullets"; title: string; items: string[] }
  | { kind: "stat"; title: string; value: string; sub: string };

// ── Lyrics → slides ─────────────────────────────────────────────────────────

/** Small seeded RNG (mulberry32), so a line always gets the same numbers. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** A series of n points heading up, down, flat-ish, or crashing at the end. */
function trend(r: Rand, n: number, dir: "up" | "down" | "flat" | "crash"): number[] {
  const out: number[] = [];
  let v = dir === "up" ? 20 : dir === "flat" ? 50 : 80;
  for (let i = 0; i < n; i++) {
    out.push(Math.max(2, Math.round(v)));
    const wobble = (r() - 0.5) * 14;
    if (dir === "up") v += 10 + wobble;
    else if (dir === "down") v -= 10 + wobble;
    else if (dir === "crash") v = i >= n - 3 ? v * 0.25 : v + wobble;
    else v += wobble;
  }
  return out;
}

interface Topic {
  re: RegExp;
  slide: (r: Rand) => TvSlide;
}

/** First match wins — same order of precedence as the stickman CUES. */
const TOPICS: Topic[] = [
  {
    re: /\b(laid off|let go|fired|pink slip|clear(ed)? (out )?my desk|cardboard box)\b/i,
    slide: () => ({ kind: "stat", title: "HEADCOUNT UPDATE", value: "−1", sub: "(it was me)" }),
  },
  {
    re: /\b(hired|paycheck|finally)\b/i,
    slide: (r) => ({ kind: "line", title: "MORALE", names: ["Joe"], series: [[...trend(r, 5, "flat").map((v) => v / 3), 100]] }),
  },
  {
    re: /\b(robots?|a\.?i\.?|machines?|algorithms?|bots?|chatbots?|replaced|software)\b/i,
    slide: (r) => ({ kind: "line", title: "JOBS: ROBOTS vs JOE", names: ["Robots", "Joe"], series: [trend(r, 6, "up"), trend(r, 6, "down")] }),
  },
  {
    re: /\b(laptop|appl(y|ied|ication)s?|r[eé]sum[eé]s?|cv|e-?mails?|inbox|linkedin|portal|online|cover letter)\b/i,
    slide: (r) => ({ kind: "bars", title: "APPLICATION FUNNEL", labels: ["Sent", "Opened", "Replied"], values: [int(r, 140, 380), int(r, 4, 19), 0], hot: 2 }),
  },
  {
    re: /\b(rejected|rejection|ghost(ed)?|never called|no reply|no answer)\b/i,
    slide: (r) => {
      const ghost = int(r, 78, 91);
      const no = int(r, 6, 100 - ghost - 1);
      return { kind: "pie", title: "EMPLOYER RESPONSES", labels: ["Ghosted", "No", "Maybe"], values: [ghost, no, 100 - ghost - no] };
    },
  },
  {
    re: /\b(phones?|calls?|called|texts?|ringing|voicemail|recruiters?)\b/i,
    slide: (r) => {
      const values = [0, 0, 0, 0, 0];
      const hot = int(r, 0, 4);
      values[hot] = 1;
      return { kind: "bars", title: "CALLS THIS WEEK", labels: ["Mon", "Tue", "Wed", "Thu", "Fri"], values, hot };
    },
  },
  {
    re: /\b(coffee|latte|espresso|mornings?|alarm)\b/i,
    slide: (r) => ({ kind: "bars", title: "CUPS OF COFFEE", labels: ["Mon", "Tue", "Wed", "Thu", "Fri"], values: trend(r, 5, "up").map((v) => Math.round(v / 10)), hot: 4 }),
  },
  {
    re: /\b(dogs?|pupp(y|ies)|walkies)\b/i,
    slide: (r) => {
      const dog = int(r, 94, 99);
      return { kind: "pie", title: "WHO STILL BELIEVES IN ME", labels: ["The dog", "Mum"], values: [dog, 100 - dog] };
    },
  },
  {
    re: /\b(rain(ing)?|storms?|cry(ing)?|tears|alone|lonely|blues?|sad|broke)\b/i,
    slide: (r) => ({ kind: "line", title: "BANK BALANCE", names: ["Savings"], series: [trend(r, 7, "crash")] }),
  },
  {
    re: /\b(interviews?|suit|office|commute|briefcase|boss)\b/i,
    slide: () => ({ kind: "bullets", title: "INTERVIEW PREP", items: ["✓ Ironed the shirt", "✓ Firm handshake", "✗ Relevant experience"] }),
  },
  {
    re: /\b(ideas?|think(ing)?|wonder(ing)?|maybe|plans?|dreams?|figure)\b/i,
    slide: (r) => ({ kind: "line", title: "FIVE-YEAR PLAN", names: ["Projected"], series: [[...trend(r, 4, "flat").map((v) => v / 4), 60, 100]] }),
  },
  {
    re: /\b(dance|dancing|party|celebrate|yes|win(ning)?)\b/i,
    slide: (r) => ({ kind: "bars", title: "VIBES", labels: ["Then", "Now", "Chorus"], values: [int(r, 5, 20), int(r, 40, 60), 100], hot: 2 }),
  },
  {
    re: /\b(why|what now|how come)\b|\?\s*$/i,
    slide: (r) => ({ kind: "stat", title: "ANSWERS FOUND", value: "0", sub: `out of ${int(r, 12, 99)} questions` }),
  },
];

/** Generic deck slides for lines with no topic; the mood picks the trend. */
function fallback(r: Rand, beat: StickmanBeat, index: number): TvSlide {
  const dir = beat.expression === "happy" ? "up" : beat.expression === "sad" || beat.expression === "tired" ? "down" : beat.expression === "shocked" ? "crash" : "flat";
  switch (int(r, 0, 4)) {
    case 0:
      return { kind: "line", title: ["Q3 OUTLOOK", "MARKET UPDATE", "SYNERGY INDEX"][int(r, 0, 2)], names: ["Joe"], series: [trend(r, 6, dir)] };
    case 1: {
      const values = [int(r, 10, 90), int(r, 10, 90), int(r, 10, 90), int(r, 10, 90)];
      return { kind: "bars", title: "KEY METRICS", labels: ["Naps", "Snacks", "Hope", "Jobs"], values: [...values.slice(0, 3), 0], hot: 3 };
    }
    case 2: {
      const a = int(r, 40, 60);
      const b = int(r, 20, 100 - a - 5);
      return { kind: "pie", title: "TIME SPENT", labels: ["Refreshing inbox", "Waiting", "Singing"], values: [a, b, 100 - a - b] };
    }
    case 3:
      return { kind: "stat", title: "DAYS UNEMPLOYED", value: String(87 + index * 3), sub: "and counting" };
    default:
      return { kind: "bullets", title: "AGENDA", items: ["1. Sing about it", "2. Shrug", "3. Circle back"] };
  }
}

/** One slide per beat, from its lyric line (first matching topic, else a generic deck slide). */
export function beatToSlide(beat: StickmanBeat, index = 0): TvSlide {
  const r = rng(beat.text.toLowerCase());
  const topic = TOPICS.find((t) => t.re.test(beat.text));
  return topic ? topic.slide(r) : fallback(r, beat, index);
}

// ── Slides → SVG ────────────────────────────────────────────────────────────
// The screen is 320 × 180; the chart area is x 34..296, y 50..146.

const W = 320;
const COLORS = ["#d3a85f", "#5fb3a8", "#b8434f", "#e9c46a"];
const HOT = "#e0525f";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(x: number, y: number, s: string, size: number, opts: { anchor?: string; cls?: string; fill?: string; delay?: number } = {}): string {
  const style = opts.delay ? ` style="animation-delay:${opts.delay}ms"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${opts.anchor ?? "middle"}"${opts.fill ? ` fill="${opts.fill}"` : ""} class="tv-t${opts.cls ? " " + opts.cls : ""}"${style}>${esc(s)}</text>`;
}

/** Up to two lines of at most `max` characters. */
function wrap(s: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) lines.splice(1, lines.length, lines.slice(1).join(" ").slice(0, max - 1) + "…");
  return lines;
}

function heading(title: string): string {
  return text(W / 2, 28, title, 15, { cls: "tv-h" }) + `<path d="M${W / 2 - 40} 37 L${W / 2 + 40} 37" class="tv-rule"/>`;
}

export function renderSlideSvg(s: TvSlide): string {
  let body = "";
  switch (s.kind) {
    case "title": {
      const lines = wrap(s.title, 20);
      const size = lines.length > 1 ? 22 : 26;
      body =
        lines.map((l, i) => text(W / 2, 82 + (i - (lines.length - 1) / 2) * (size + 4), l, size, { cls: "tv-h tv-in" })).join("") +
        `<path d="M110 ${112 + (lines.length - 1) * 6} L210 ${112 + (lines.length - 1) * 6}" class="tv-rule"/>` +
        text(W / 2, 134 + (lines.length - 1) * 6, s.sub, 11, { cls: "tv-dim tv-in", delay: 300 });
      break;
    }
    case "bars": {
      const n = s.values.length;
      const slot = 262 / n;
      const bw = Math.min(46, slot * 0.6);
      const max = Math.max(1, ...s.values);
      body = heading(s.title) + `<path d="M30 146 L300 146" class="tv-axis"/>`;
      s.values.forEach((v, i) => {
        const h = Math.max(v > 0 ? 3 : 0, (v / max) * 82);
        const x = 34 + slot * i + (slot - bw) / 2;
        const fill = i === s.hot ? HOT : COLORS[i % 2];
        const delay = 150 + i * 140;
        if (h > 0) body += `<rect x="${x.toFixed(1)}" y="${(146 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${fill}" class="tv-bar" style="animation-delay:${delay}ms"/>`;
        body += text(x + bw / 2, 146 - h - 5, String(v), 11, { cls: "tv-in", delay: delay + 400 });
        body += text(x + bw / 2, 161, s.labels[i] ?? "", 10, { cls: "tv-dim" });
      });
      break;
    }
    case "line": {
      const max = Math.max(1, ...s.series.flat());
      body = heading(s.title) + `<path d="M30 146 L300 146 M34 50 L34 146" class="tv-axis"/>`;
      s.series.forEach((pts, si) => {
        const color = s.series.length > 1 && si === 1 ? HOT : COLORS[si === 0 && s.series.length > 1 ? 1 : 0];
        const xy = pts.map((v, i) => [34 + (262 * i) / Math.max(1, pts.length - 1), 146 - (v / max) * 90] as const);
        const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const delay = 150 + si * 300;
        body += `<path d="${d}" pathLength="1" fill="none" stroke="${color}" class="tv-line" style="animation-delay:${delay}ms"/>`;
        const [ex, ey] = xy[xy.length - 1];
        body += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="${color}" class="tv-in" style="animation-delay:${delay + 1000}ms"/>`;
        if (s.names.length > 1 || si === 0)
          body += text(Math.min(ex - 6, 290), Math.max(56, ey - 9), s.names[si] ?? "", 10, { anchor: "end", fill: color, cls: "tv-in", delay: delay + 1000 });
      });
      break;
    }
    case "pie": {
      const total = s.values.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      // The rotation sits on an outer group: the spin-in animation's transform would replace it.
      body = heading(s.title) + `<g transform="rotate(-90 92 100)"><g class="tv-pie">`;
      s.values.forEach((v, i) => {
        const share = (v / total) * 100;
        body += `<circle cx="92" cy="100" r="22" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="44" pathLength="100" stroke-dasharray="${share.toFixed(2)} 100" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
        acc += share;
      });
      body += `</g></g>`;
      s.labels.forEach((l, i) => {
        const y = 82 + i * 22 - (s.labels.length - 2) * 11;
        const delay = 400 + i * 160;
        body += `<rect x="160" y="${y - 9}" width="10" height="10" rx="2" fill="${COLORS[i % COLORS.length]}" class="tv-in" style="animation-delay:${delay}ms"/>`;
        body += text(176, y, `${l} ${Math.round(((s.values[i] ?? 0) / total) * 100)}%`, 12, { anchor: "start", cls: "tv-in", delay });
      });
      break;
    }
    case "bullets":
      body =
        heading(s.title) +
        s.items
          .map((it, i) => {
            const mark = it[0] === "✗" ? HOT : it[0] === "✓" ? COLORS[1] : undefined;
            return text(56, 72 + i * 28, it, 15, { anchor: "start", cls: "tv-slide", fill: mark, delay: 250 + i * 380 });
          })
          .join("");
      break;
    case "stat":
      body = heading(s.title) + text(W / 2, 116, s.value, 60, { cls: "tv-h tv-pop", delay: 150 }) + text(W / 2, 148, s.sub, 12, { cls: "tv-dim tv-in", delay: 600 });
      break;
  }
  return `<svg viewBox="0 0 ${W} 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

// ── Page parts ──────────────────────────────────────────────────────────────

export interface TvData {
  /** When each slide starts, as fractions of the song; slide 0 (the title card) starts at 0. */
  at: number[];
  /** Rendered slides; repeats are shared by index. */
  slides: string[];
  order: number[];
}

/** The title card for the intro, then one slide per beat (deduplicated). */
export function buildTvData(beats: StickmanBeat[], title: string, lineStarts?: number[] | null): TvData {
  const starts = beatStarts(beats, undefined, undefined, lineStarts);
  const slides: string[] = [];
  const order: number[] = [];
  const add = (svg: string) => {
    let i = slides.indexOf(svg);
    if (i < 0) i = slides.push(svg) - 1;
    order.push(i);
  };
  add(renderSlideSvg({ kind: "title", title: title || "Untitled Song", sub: "A presentation by Joe" }));
  beats.forEach((b, i) => add(renderSlideSvg(beatToSlide(b, i))));
  return { at: [0, ...starts], slides, order };
}

export const TV_CSS = `
.tv{position:relative;width:76%;margin:2.2vh auto 0;padding:1.4vh 1.4vh 1.8vh;border-radius:2vh;
  background:linear-gradient(180deg,#6b4630,#4a2f20);box-shadow:0 1.6vh 4vh rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.18)}
.tv::before,.tv::after{content:"";position:absolute;bottom:100%;left:50%;width:2px;height:5vh;background:#a89a86;transform-origin:50% 100%}
.tv::before{transform:rotate(-28deg)}.tv::after{transform:rotate(28deg)}
.tv-screen{position:relative;aspect-ratio:16/9;border-radius:1.4vh;overflow:hidden;
  background:radial-gradient(120% 100% at 50% 40%,#1d3a40,#0b171b 75%);box-shadow:inset 0 0 3vh rgba(0,0,0,.8)}
.tv-screen::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px),radial-gradient(90% 70% at 30% 20%,rgba(255,255,255,.08),transparent 60%)}
.tv-screen svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.tv-screen.flip svg{animation:tv-flip .32s ease-out both}
.tv-knobs{position:absolute;right:2.2vh;bottom:.45vh;display:flex;gap:.8vh}
.tv-knobs i{width:.9vh;height:.9vh;border-radius:50%;background:#d3a85f;opacity:.8}
.tv-t{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;font-weight:700;fill:#eaf4ef}
.tv-h{letter-spacing:.06em}
.tv-dim{fill:#9fbab4;font-weight:600}
.tv-rule{stroke:#d3a85f;stroke-width:2;stroke-linecap:round}
.tv-axis{stroke:#5d7c78;stroke-width:1.5;fill:none}
.tv-bar{transform-box:fill-box;transform-origin:50% 100%;animation:tv-grow .7s cubic-bezier(.2,1.2,.3,1) both}
.tv-line{stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;animation:tv-draw 1.1s ease-out both}
.tv-pie{transform-box:fill-box;transform-origin:50% 50%;animation:tv-spin .8s cubic-bezier(.2,1.1,.3,1) both}
.tv-in{animation:tv-in .45s ease-out both}
.tv-pop{transform-box:fill-box;transform-origin:50% 50%;animation:tv-pop .5s cubic-bezier(.3,1.6,.5,1) both}
.tv-slide{animation:tv-slide .5s cubic-bezier(.2,1,.3,1) both}
@keyframes tv-flip{0%{opacity:0;filter:brightness(3);transform:scaleY(.04)}60%{opacity:1;transform:scaleY(1.04)}100%{filter:none;transform:none}}
@keyframes tv-grow{from{transform:scaleY(0)}to{transform:none}}
@keyframes tv-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes tv-spin{from{transform:scale(.2) rotate(-120deg);opacity:0}to{transform:none;opacity:1}}
@keyframes tv-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes tv-pop{from{transform:scale(0);opacity:0}to{transform:none;opacity:1}}
@keyframes tv-slide{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tv *{animation:none!important}}
`;

/** JSON safe to inline in a <script> (no "</script>" breakout). */
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

/** The TV set with the title card on screen, plus its slide data. */
export function tvHtml(beats: StickmanBeat[], title: string, lineStarts?: number[] | null): string {
  const data = buildTvData(beats, title, lineStarts);
  return `<div class="tv" aria-hidden="true">
  <div class="tv-screen" id="tvScreen">${data.slides[0]}</div>
  <div class="tv-knobs"><i></i><i></i></div>
  <script type="application/json" id="tvData">${inlineJson(data)}</script>
</div>`;
}

/**
 * Defines window.joeTv = { update(songMs, durMs) }: shows the slide for that
 * moment, flicking over (CRT flip, animations replay) when it changes.
 * Plain ES5 in a string, no backticks or template holes.
 */
export const TV_JS = String.raw`
(function () {
  var screen = document.getElementById("tvScreen"), el = document.getElementById("tvData");
  if (!screen || !el) return;
  var data = JSON.parse(el.textContent || "{}"), shown = 0;
  window.joeTv = {
    update: function (songMs, durMs) {
      var f = durMs > 0 ? songMs / durMs : 0, idx = 0;
      for (var k = 0; k < data.at.length; k++) if (f >= data.at[k]) idx = k;
      var s = data.order[idx];
      if (s === data.order[shown]) { shown = idx; return; }
      shown = idx;
      screen.innerHTML = data.slides[s];
      screen.classList.remove("flip");
      void screen.offsetWidth;
      screen.classList.add("flip");
    }
  };
})();
`;

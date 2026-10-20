/**
 * Stickman rig — one live SVG Joe whose joints are driven every frame, for
 * the song page stage and the stickman video page. (Memes keep the static
 * drawing in stickman.ts.)
 *
 * What moves:
 *   1. Poses glide: joints ease from one lyric line's pose to the next.
 *   2. Lip sync: the page decodes its own audio into a loudness curve
 *      (50 per second) and opens his mouth with it — same in a browser, on
 *      the song page and in P&R's recorder, which plays no audio itself.
 *   3. Chorus dance: on CHORUS/HOOK lines he loops dance moves on the beat;
 *      the tempo is estimated from the loudness curve (fallback 100 BPM).
 *   4. Life: blinks, head tilt, a foot tapping on the beat, the free arm
 *      gesturing while he sings, a bounce on the beat.
 *   5. Stage: notes float off the mic when it's loud, confetti on
 *      celebrations, props drop/slide/pop in, the camera pushes in on sad
 *      lines, and (CSS) the spotlight sweeps.
 *
 * Server side builds the data (beats, poses, faces, prop markup) and the
 * skeleton SVG; JOE_RIG_JS is the browser engine that animates it.
 */

import { POSES, beatStarts, type PoseDef, type StickmanBeat, type StickmanExpression, type StickmanProp } from "./stickman";

const GROUND = 392;
const VIEW_W = 500;
const VIEW_H = 420;

/** Extra moves for the chorus dance (same joint layout as POSES). */
const DANCE: Record<string, PoseDef> = {
  stepL: { le: [-36, 190], lh: [-52, 150], re: [28, 214], rh: [44, 244], lk: [-24, 328], lf: [-40, 388], rk: [8, 334], rf: [14, GROUND], head: [-5, 0] },
  stepR: { le: [-28, 214], lh: [-44, 244], re: [36, 190], rh: [52, 150], lk: [-8, 334], lf: [-14, GROUND], rk: [24, 328], rf: [40, 388], head: [5, 0] },
  guns: { le: [-30, 196], lh: [-64, 192], re: [30, 196], rh: [64, 192], lk: [-14, 330], lf: [-24, GROUND], rk: [14, 330], rf: [24, GROUND] },
  reach: { le: [-24, 214], lh: [-30, 258], re: [34, 140], rh: [40, 92], lk: [-12, 330], lf: [-20, GROUND], rk: [16, 328], rf: [30, 386], head: [3, -2] },
};

/** Eyes per expression, around the head centre (the mouth is drawn live). */
const EYES: Record<StickmanExpression, string> = {
  neutral: dots(),
  happy: dots(),
  sad: dots() + line("M-17 -11 L-6 -16") + line("M6 -16 L17 -11"), // brows up toward the middle: worried, not angry
  shocked:
    `<circle cx="-11" cy="-6" r="5.5" pathLength="1" fill="none" class="sm-ink sm-thin"/>` +
    `<circle cx="11" cy="-6" r="5.5" pathLength="1" fill="none" class="sm-ink sm-thin"/>` +
    line("M-17 -17 L-6 -19") +
    line("M6 -19 L17 -17"),
  deadpan: line("M-16 -5 L-6 -5") + line("M6 -5 L16 -5"),
  smug: line("M-16 -4 L-6 -6") + `<circle cx="11" cy="-5" r="3.6" class="sm-dot"/>` + line("M5 -16 L17 -20"),
  tired: line("M-16 -4 L-6 -4") + line("M6 -4 L16 -4") + line("M-15 2 Q-11 5 -7 2") + line("M7 2 Q11 5 15 2"),
};

/** The resting mouth per expression (when he isn't singing a loud bit). */
const MOUTHS: Record<StickmanExpression, string> = {
  neutral: "M-9 12 L9 12",
  happy: "M-12 8 Q0 22 12 8",
  sad: "M-11 17 Q0 7 11 17",
  shocked: "M-6 14 Q0 2 6 14 Q0 26 -6 14 Z",
  deadpan: "M-7 13 L7 13",
  smug: "M-8 13 Q4 16 12 6",
  tired: "M-9 14 Q-4.5 10 0 14 Q4.5 18 9 14",
};

function dots(): string {
  return `<circle cx="-11" cy="-5" r="3.6" class="sm-dot"/><circle cx="11" cy="-5" r="3.6" class="sm-dot"/>`;
}
function line(d: string): string {
  return `<path d="${d}" pathLength="1" fill="none" class="sm-ink sm-thin"/>`;
}
function ink(d: string, cls = ""): string {
  return `<path d="${d}" pathLength="1" fill="none" class="sm-ink${cls ? " " + cls : ""}"/>`;
}
function filled(shape: string, fill: string, cls = ""): string {
  const paper = fill === "paper";
  return `<${shape} pathLength="1" fill="${paper ? "#fff" : fill}" class="sm-ink${paper ? " sm-paper" : ""}${cls ? " " + cls : ""}"/>`;
}

type Anchor = "fig" | "lh" | "rh" | "head";
type Enter = "drop" | "slide" | "pop";

/**
 * A prop's markup in its anchor's own coordinates (0,0 = the hand, the head
 * centre, or the figure's centre line), how it attaches, and how it arrives.
 */
export function propRig(prop: StickmanProp, carrying: boolean): { anchor: Anchor; enter: Enter; svg: string } {
  switch (prop) {
    case "mic":
      return {
        anchor: "fig",
        enter: "pop",
        svg: ink(`M64 ${GROUND} L64 182`) + ink(`M46 ${GROUND} L82 ${GROUND}`) + filled(`rect x="55" y="160" width="18" height="26" rx="9"`, "#9ca3af") + ink("M64 186 L64 196", "sm-thin"),
      };
    case "laptop":
      return {
        anchor: "fig",
        enter: "slide",
        svg:
          ink("M40 244 L170 244") + ink(`M52 244 L52 ${GROUND}`) + ink(`M158 244 L158 ${GROUND}`) +
          filled(`rect x="62" y="234" width="76" height="9" rx="2"`, "#d9dde3") + ink("M138 238 L152 184", "sm-thick"),
      };
    case "phone":
      return { anchor: "rh", enter: "pop", svg: filled(`rect x="-7" y="-24" width="14" height="25" rx="3"`, "paper") };
    case "coffee":
      return {
        anchor: "lh",
        enter: "pop",
        svg:
          filled(`path d="M-10 -14 L-8 8 L8 8 L10 -14 Z"`, "paper") + ink("M10 -8 Q19 -5 9 3", "sm-thin") +
          ink("M-3 -20 Q1 -26 -3 -32", "sm-thin sm-steam") + ink("M4 -20 Q8 -26 4 -32", "sm-thin sm-steam"),
      };
    case "box": {
      const [bx, by, w, h] = carrying ? [-50, 222, 100, 64] : [56, 334, 84, 58];
      return {
        anchor: "fig",
        enter: carrying ? "pop" : "drop",
        svg:
          filled(`rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="3"`, "#ead6ad") + ink(`M${bx} ${by + 14} L${bx + w} ${by + 14}`, "sm-thin") +
          ink(`M${bx + 24} ${by} L${bx + 22} ${by - 28}`, "sm-thin") +
          ink(`M${bx + 22} ${by - 18} Q${bx + 6} ${by - 24} ${bx + 4} ${by - 38} Q${bx + 18} ${by - 34} ${bx + 22} ${by - 18}`, "sm-thin") +
          ink(`M${bx + 23} ${by - 24} Q${bx + 36} ${by - 34} ${bx + 44} ${by - 44} Q${bx + 42} ${by - 30} ${bx + 23} ${by - 24}`, "sm-thin"),
      };
    }
    case "dog":
      return {
        anchor: "fig",
        enter: "slide",
        svg:
          ink("M80 352 L132 352") + `<circle cx="144" cy="336" r="12" pathLength="1" fill="none" class="sm-ink"/>` +
          ink("M138 326 L134 314 L147 324", "sm-thin") +
          ink(`M86 352 L82 ${GROUND - 2} M98 352 L100 ${GROUND - 2} M118 352 L114 ${GROUND - 2} M130 352 L134 ${GROUND - 2}`) +
          ink("M80 352 Q66 346 68 330", "sm-wag") + `<circle cx="149" cy="334" r="2.6" class="sm-dot"/>`,
      };
    case "briefcase":
      return { anchor: "lh", enter: "pop", svg: ink("M-7 4 Q0 -6 7 4", "sm-thin") + filled(`rect x="-19" y="4" width="38" height="27" rx="3"`, "#7a5134") };
    case "cloud":
      return {
        anchor: "head",
        enter: "drop",
        svg:
          filled(
            `path d="M-48 -60 Q-64 -60 -60 -74 Q-56 -88 -40 -84 Q-32 -100 -14 -94 Q0 -104 12 -88 Q32 -88 28 -72 Q28 -60 12 -60 Z"`,
            "#9aa3ae",
          ) + ink("M-38 -50 l-4 12 M-16 -48 l-4 12 M6 -50 l-4 12", "sm-thin sm-rain"),
      };
    case "lightbulb":
      return {
        anchor: "head",
        enter: "pop",
        svg:
          `<circle cx="-62" cy="-58" r="16" pathLength="1" fill="#fde68a" class="sm-ink sm-glow"/>` +
          ink("M-69 -40 L-55 -40 M-68 -34 L-56 -34", "sm-thin") +
          ink("M-62 -84 L-62 -92 M-84 -72 L-91 -77 M-40 -72 L-33 -77", "sm-thin"),
      };
  }
}

const SIDE_PROPS: ReadonlySet<StickmanProp> = new Set(["laptop", "dog", "mic"]);

export interface RigBeat {
  at: number;
  pose: string;
  expr: StickmanExpression;
  text: string;
  sec: string;
  /** Figure centre x: shifted left when a floor prop needs room. */
  cx: number;
  /** CHORUS / HOOK lines dance on the beat. */
  dance: boolean;
  prop?: { anchor: Anchor; enter: Enter; svg: string; key: string };
}

export interface RigData {
  beats: RigBeat[];
  poses: Record<string, PoseDef>;
  eyes: Record<string, string>;
  mouths: Record<string, string>;
}

/** Everything the browser engine needs, as plain JSON. */
export function buildRigData(beats: StickmanBeat[], lineStarts?: number[] | null): RigData {
  const starts = beatStarts(beats, undefined, undefined, lineStarts);
  return {
    beats: beats.map((b, i) => {
      const side = !!b.prop && (SIDE_PROPS.has(b.prop) || (b.prop === "box" && b.pose !== "carry"));
      return {
        at: starts[i],
        pose: b.pose,
        expr: b.expression,
        text: b.text,
        sec: b.section ?? "",
        cx: side ? 200 : 250,
        dance: /CHORUS|HOOK/.test(b.section ?? "") && (b.pose === "sing" || b.pose === "celebrate"),
        ...(b.prop ? { prop: { ...propRig(b.prop, b.pose === "carry"), key: `${b.prop}:${b.pose === "carry"}` } } : {}),
      };
    }),
    poses: { ...POSES, ...DANCE },
    eyes: EYES,
    mouths: MOUTHS,
  };
}

/** The skeleton the engine animates. Classes match the ink CSS. */
export function rigSvg(tie: string): string {
  const el = (cls: string, d = 0) => `<path class="sm-ink ${cls}" pathLength="1" fill="none" style="--d:${d}ms"/>`;
  return `<svg class="sm-joe" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<g class="sm-cam">
<path d="M18 ${GROUND} L${VIEW_W - 18} ${GROUND}" pathLength="1" fill="none" class="sm-ink sm-thin sm-ground" style="--d:0ms"/>
<g class="sm-figwrap">
<g class="sm-props"></g>
${el("sm-torso", 200)}
<path class="sm-ink sm-thin sm-tie" pathLength="1" fill="${tie}" d="M-6 4 L6 4 L4 14 L9 54 L0 66 L-9 54 L-4 14 Z" style="--d:320ms"/>
${el("sm-armL", 380)}${el("sm-armR", 440)}${el("sm-legL", 520)}${el("sm-legR", 580)}
<g class="sm-head"><circle r="32" pathLength="1" fill="#fff" class="sm-ink sm-paper" style="--d:0ms"/><g class="sm-eyes"></g><path class="sm-ink sm-thin sm-mouth" pathLength="1" fill="none" style="--d:700ms"/></g>
<g class="sm-handprops"></g>
</g>
<g class="sm-fx"></g>
</g>
</svg>`;
}

/** Ink, entrances, spotlight sweep. Theme via --sm-ink / --sm-paper / --sm-accent on .sm-stage. */
export const RIG_CSS = `
.sm-stage{position:relative;overflow:hidden}
.sm-stage::before{content:"";position:absolute;inset:-25% -35%;pointer-events:none;
  background:radial-gradient(30% 42% at 50% 30%,rgba(255,236,196,.20),transparent 70%);animation:sm-spot 9s ease-in-out infinite alternate}
@keyframes sm-spot{from{transform:translateX(-14%) rotate(-4deg)}to{transform:translateX(14%) rotate(4deg)}}
.sm-joe{position:relative;display:block;width:100%;height:auto;overflow:visible}
.sm-ink{stroke:var(--sm-ink);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 0}
.sm-thin{stroke-width:4}.sm-thick{stroke-width:9}.sm-ground{stroke-width:3;opacity:.45}
.sm-paper{fill:var(--sm-paper)}
.sm-dot{fill:var(--sm-ink)}
.sm-mouth.open{fill:var(--sm-ink)}
.sm-joe.drawing .sm-ink{stroke-dasharray:1;animation:sm-draw 480ms cubic-bezier(.3,.9,.4,1) var(--d,0ms) both}
@keyframes sm-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.sm-enter-pop{transform-box:fill-box;transform-origin:50% 100%;animation:sm-pop .45s cubic-bezier(.3,1.6,.5,1) both}
.sm-enter-drop{animation:sm-drop .7s cubic-bezier(.3,1.4,.5,1) both}
.sm-enter-slide{animation:sm-slide .7s cubic-bezier(.2,1.2,.4,1) both}
@keyframes sm-pop{from{transform:scale(0);opacity:0}to{transform:none;opacity:1}}
@keyframes sm-drop{from{transform:translateY(-140px);opacity:0}60%{opacity:1}to{transform:none}}
@keyframes sm-slide{from{transform:translateX(220px);opacity:0}to{transform:none;opacity:1}}
.sm-steam{animation:sm-steam 1.4s ease-in-out infinite}
.sm-rain{animation:sm-rain .7s linear infinite}
.sm-glow{animation:sm-glow 1.2s ease-in-out infinite alternate}
.sm-wag{transform-box:fill-box;transform-origin:100% 100%;animation:sm-wag .35s ease-in-out infinite alternate}
@keyframes sm-steam{50%{transform:translateY(-4px);opacity:.4}}
@keyframes sm-rain{from{transform:translateY(0);opacity:1}to{transform:translateY(14px);opacity:0}}
@keyframes sm-glow{to{filter:drop-shadow(0 0 8px #fbbf24)}}
@keyframes sm-wag{to{transform:rotate(18deg)}}
.sm-note{font:700 26px/1 Georgia,serif;fill:var(--sm-accent)}
@media (prefers-reduced-motion:reduce){.sm-stage *,.sm-stage::before{animation:none!important}}
`;

/**
 * The browser engine. Defines window.JoeRig.mount(svg, data, audio), which
 * returns { update(songMs, durMs, playing) → beat index }. Call update every
 * animation frame with the page's own clock.
 *
 * Plain ES5-style JS in a string (no backticks or template holes inside),
 * so the bundler never touches it.
 */
export const JOE_RIG_JS = String.raw`
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var KEYS = ["le", "lh", "re", "rh", "lk", "lf", "rk", "rf", "head"];
  var SHOULDER = [0, 168], HIP = [0, 268], HEAD = [0, 108];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function copyPose(p) { var o = {}; KEYS.forEach(function (k) { var v = p[k] || [0, 0]; o[k] = [v[0], v[1]]; }); return o; }
  function lerpPose(a, b, t) { var o = {}; KEYS.forEach(function (k) { o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t]; }); return o; }
  function P(p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }

  // Loudness curve (50/s, 0..1) and tempo from the song itself.
  function analyse(audio, done) {
    var src = audio && (audio.currentSrc || audio.getAttribute("src"));
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!src || !Ctx) return done(null);
    fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var ctx = new Ctx();
      return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); }).then(function (ab) {
        try { ctx.close(); } catch (e) {}
        var ch = ab.getChannelData(0), hop = Math.round(ab.sampleRate / 50), n = Math.floor(ch.length / hop);
        var env = new Float32Array(n), i, j, s, v;
        for (i = 0; i < n; i++) { s = 0; for (j = i * hop; j < (i + 1) * hop; j++) { v = ch[j]; s += v * v; } env[i] = Math.sqrt(s / hop); }
        var sorted = Array.prototype.slice.call(env).sort(function (a, b) { return a - b; });
        var top = sorted[Math.floor(n * 0.95)] || 1;
        for (i = 0; i < n; i++) env[i] = clamp(env[i] / top, 0, 1);
        // Tempo: autocorrelate onset strength over 60–160 BPM.
        var on = new Float32Array(n);
        for (i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
        var best = 0, lagBest = 30;
        for (var lag = 19; lag <= 50; lag++) { s = 0; for (i = lag; i < n; i++) s += on[i] * on[i - lag]; if (s > best) { best = s; lagBest = lag; } }
        var phaseBest = 0, pb = -1;
        for (var ph = 0; ph < lagBest; ph++) { s = 0; for (i = ph; i < n; i += lagBest) s += on[i]; if (s > pb) { pb = s; phaseBest = ph; } }
        done({ env: env, beatMs: lagBest * 20, phaseMs: phaseBest * 20 });
      });
    }).catch(function () { done(null); });
  }

  function mount(svg, data, audio) {
    var q = function (c) { return svg.querySelector("." + c); };
    var wrap = q("sm-figwrap"), torso = q("sm-torso"), tie = q("sm-tie");
    var arms = [q("sm-armL"), q("sm-armR")], legs = [q("sm-legL"), q("sm-legR")];
    var head = q("sm-head"), eyes = q("sm-eyes"), mouth = q("sm-mouth");
    var props = q("sm-props"), handProps = q("sm-handprops"), fx = q("sm-fx"), cam = q("sm-cam");
    var beats = data.beats.length ? data.beats : [{ at: 0, pose: "sing", expr: "smug", text: "", sec: "", cx: 250, dance: false }];
    var music = null;
    analyse(audio, function (m) { music = m; });

    var cur = -1, shown = copyPose(data.poses.stand), from = shown, to = shown, tStart = 0, tDur = 450;
    var cxFrom = beats[0].cx, cxTo = cxFrom, cxStart = 0, zoom = 1, expr = "";
    var nextBlink = 1800, blinkUntil = 0, lastNote = 0, lastMove = -1, parts = [];
    var t0 = performance.now();

    svg.classList.add("drawing");
    setTimeout(function () { svg.classList.remove("drawing"); }, 1800);

    function setPose(target, now, dur) { from = shown; to = copyPose(target); tStart = now; tDur = dur; }
    function setExpr(e) {
      if (e === expr) return;
      expr = e;
      eyes.innerHTML = data.eyes[e] || data.eyes.neutral;
    }
    function setProp(b) {
      var key = b.prop ? b.prop.key : "";
      if (props.getAttribute("data-key") === key) return;
      props.setAttribute("data-key", key);
      props.innerHTML = ""; handProps.innerHTML = "";
      if (!b.prop) return;
      var g = document.createElementNS(NS, "g");
      g.setAttribute("data-anchor", b.prop.anchor);
      g.innerHTML = '<g class="sm-enter-' + b.prop.enter + '">' + b.prop.svg + "</g>";
      (b.prop.anchor === "fig" ? props : handProps).appendChild(g);
    }
    function spawn(kind, x, y) {
      var el;
      if (kind === "note") {
        el = document.createElementNS(NS, "text");
        el.setAttribute("class", "sm-note");
        el.textContent = Math.random() < 0.5 ? "♪" : "♫";
        parts.push({ el: el, x: x, y: y, vx: (Math.random() - 0.5) * 18, vy: -38 - Math.random() * 24, rot: 0, vr: (Math.random() - 0.5) * 40, life: 1700, born: performance.now(), g: 0, sway: Math.random() * 6 });
      } else {
        el = document.createElementNS(NS, "rect");
        el.setAttribute("width", "7"); el.setAttribute("height", "11");
        el.setAttribute("fill", ["#d3a85f", "#b8434f", "#f6ecda", "#5fb3a8", "#e9c46a"][Math.floor(Math.random() * 5)]);
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 160 + Math.random() * 160;
        parts.push({ el: el, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 720, life: 2400, born: performance.now(), g: 260, sway: 0 });
      }
      fx.appendChild(el);
    }
    function stepParticles(now, dt) {
      parts = parts.filter(function (p) {
        var age = now - p.born;
        if (age > p.life) { p.el.remove(); return false; }
        p.vy += p.g * dt; p.x += p.vx * dt + Math.sin(age / 180) * p.sway * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        p.el.setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ") rotate(" + p.rot.toFixed(0) + ")");
        p.el.setAttribute("opacity", (1 - Math.pow(age / p.life, 2)).toFixed(2));
        return true;
      });
    }
    function loud(ms) {
      if (music) { var i = Math.floor(ms / 20); return i >= 0 && i < music.env.length ? music.env[i] : 0; }
      return 0.35 + 0.35 * Math.sin(ms / 95) * Math.sin(ms / 210); // no audio data: a plausible chatter
    }

    var lastNow = performance.now();
    function update(songMs, durMs, playing) {
      var now = performance.now(), dt = Math.min(0.05, (now - lastNow) / 1000), t = (now - t0) / 1000;
      lastNow = now;
      durMs = durMs > 0 ? durMs : 60000;
      var f = clamp(songMs / durMs, 0, 1), idx = 0;
      for (var k = 0; k < beats.length; k++) if (f >= beats[k].at) idx = k;
      var b = beats[idx];
      var beatMs = music ? music.beatMs : 600, phaseMs = music ? music.phaseMs : 0;
      var beatPos = (songMs - phaseMs) / beatMs, beatFrac = beatPos - Math.floor(beatPos);

      if (idx !== cur) {
        var prev = cur >= 0 ? beats[cur] : null;
        cur = idx;
        setPose(data.poses[b.pose] || data.poses.stand, now, prev ? 450 : 1);
        setExpr(b.expr);
        setProp(b);
        if (b.cx !== cxTo) { cxFrom = cxTo; cxTo = b.cx; cxStart = now; }
        if (b.pose === "celebrate" && playing) for (var c = 0; c < 46; c++) spawn("confetti", b.cx, 120);
        lastMove = -1;
      }
      // 3. Chorus dance: a new move every beat.
      if (b.dance && playing) {
        var seq = ["stepL", "stepR", b.pose, "guns", "stepR", "stepL", "reach", b.pose];
        var mv = Math.floor(beatPos);
        if (mv !== lastMove) { lastMove = mv; setPose(data.poses[seq[((mv % seq.length) + seq.length) % seq.length]] || data.poses.sing, now, Math.min(320, beatMs * 0.6)); }
      }
      // 1. Glide between poses.
      shown = lerpPose(from, to, ease(clamp((now - tStart) / tDur, 0, 1)));
      var p = copyPose(shown);
      // 4. Life on top of the pose.
      var singing = b.pose === "sing" || b.pose === "celebrate" || b.dance;
      if (b.pose === "sing" && !b.dance) { p.lh[0] += Math.sin(t * 1.4) * 9; p.lh[1] += Math.cos(t * 1.1) * 8; }
      var bounce = playing ? -Math.pow(Math.sin(Math.PI * beatFrac), 2) * (b.dance ? 7 : 3) : Math.sin(t * 2) * 1.5;
      if (playing && !b.dance && b.pose !== "walk" && b.pose !== "celebrate") p.rf[1] -= Math.max(0, Math.sin(2 * Math.PI * beatFrac)) * 8;
      var tilt = Math.sin(t * 0.9) * 3 + (b.dance ? Math.sin(Math.PI * beatPos) * 7 : 0);

      var cxT = clamp((now - cxStart) / 700, 0, 1), cx = cxFrom + (cxTo - cxFrom) * ease(cxT);
      wrap.setAttribute("transform", "translate(" + cx.toFixed(1) + " " + bounce.toFixed(1) + ")");
      var hx = HEAD[0] + p.head[0], hy = HEAD[1] + p.head[1];
      var neck = [hx * 0.6, hy + 32];
      torso.setAttribute("d", "M" + P(neck) + " L" + P(HIP));
      tie.setAttribute("transform", "translate(" + neck[0].toFixed(1) + " " + neck[1].toFixed(1) + ") rotate(" + (tilt * 0.3).toFixed(1) + ")");
      arms[0].setAttribute("d", "M" + P(SHOULDER) + " L" + P(p.le) + " L" + P(p.lh));
      arms[1].setAttribute("d", "M" + P(SHOULDER) + " L" + P(p.re) + " L" + P(p.rh));
      legs[0].setAttribute("d", "M" + P(HIP) + " L" + P(p.lk) + " L" + P(p.lf));
      legs[1].setAttribute("d", "M" + P(HIP) + " L" + P(p.rk) + " L" + P(p.rf));
      head.setAttribute("transform", "translate(" + hx.toFixed(1) + " " + hy.toFixed(1) + ") rotate(" + tilt.toFixed(1) + ")");

      // Hand/head props follow their anchor.
      var hp = handProps.firstChild;
      if (hp) {
        var an = hp.getAttribute("data-anchor"), at = an === "lh" ? p.lh : an === "rh" ? p.rh : [hx, hy];
        hp.setAttribute("transform", "translate(" + at[0].toFixed(1) + " " + at[1].toFixed(1) + ")");
      }

      // Blink every few seconds.
      if (now > nextBlink + t0) { blinkUntil = now + 140; nextBlink = now - t0 + 2200 + Math.random() * 3000; }
      eyes.setAttribute("transform", now < blinkUntil ? "translate(0 -5) scale(1 0.12) translate(0 5)" : "");

      // 2. Lip sync.
      var lv = playing ? loud(songMs) : 0, open = singing || lv > 0.45 ? clamp((lv - 0.12) / 0.6, 0, 1) : 0;
      if (open > 0.06) {
        mouth.setAttribute("d", "M-9 12 Q0 " + (12 + 20 * open).toFixed(1) + " 9 12 Q0 " + (12 + 4 * open).toFixed(1) + " -9 12 Z");
        mouth.classList.add("open");
      } else {
        mouth.setAttribute("d", data.mouths[b.expr] || data.mouths.neutral);
        mouth.classList.toggle("open", b.expr === "shocked");
      }

      // 5. Notes off the mic (or his mouth) when it's loud.
      if (playing && lv > 0.6 && now - lastNote > 380 && singing) {
        lastNote = now;
        var mic = b.prop && b.prop.key.indexOf("mic") === 0;
        spawn("note", cx + (mic ? 64 : hx + 18), mic ? 156 : hy + bounce);
      }
      stepParticles(now, dt);

      // 5. Camera: push in on the low points, ease back out.
      var low = b.expr === "sad" || b.expr === "tired" || b.pose === "slump";
      zoom += ((low && playing ? 1.14 : 1) - zoom) * Math.min(1, dt * 0.8);
      cam.setAttribute("transform", "translate(" + cx.toFixed(1) + " 220) scale(" + zoom.toFixed(4) + ") translate(" + (-cx).toFixed(1) + " -220)");
      return idx;
    }
    return { update: update };
  }
  window.JoeRig = { mount: mount };
})();
`;

// ── Stage: markup + drivers ─────────────────────────────────────────────────

function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON safe to inline in a <script> (no "</script>" breakout). */
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\u003c");
}

/** Stage layout + ink + effects. Theme with --sm-ink / --sm-paper / --sm-accent on .sm-stage. */
export const STICKMAN_STAGE_CSS = `
.sm-stage{margin:26px 0 0;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:16px;
  background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(0,0,0,.25))}
.sm-joe{max-height:52vh}
.sm-line{position:relative;margin:0;padding:6px 18px 18px;text-align:center;font-size:clamp(17px,3.6vw,22px);line-height:1.4;min-height:3.2em;color:var(--sm-ink)}
.sm-sec{position:absolute;top:12px;left:14px;z-index:1;font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--sm-accent);opacity:.85}
${RIG_CSS}`;

/** The stage: the live figure, the section label and the lyric caption, plus the rig data. */
export function stickmanStageHtml(beats: StickmanBeat[], tie: string, lineStarts?: number[] | null): string {
  if (beats.length === 0) return "";
  return `<section class="sm-stage" id="smStage" aria-label="Joe acts out the song">
  <span class="sm-sec" id="smSec">${escHtml(beats[0].section ?? "")}</span>
  ${rigSvg(tie)}
  <p class="sm-line" id="smLine">${escHtml(beats[0].text)}</p>
  <script type="application/json" id="smData">${inlineJson(buildRigData(beats, lineStarts))}</script>
</section>`;
}

/**
 * The engine plus a driver that follows <audio id={audioId}> (song page).
 * The rig runs every frame: idle life while paused, the full show while playing.
 * With external: true, only mounts window.joeStage — the page drives update().
 */
export function stickmanStageScript(audioId: string, opts: { external?: boolean } = {}): string {
  return `<script>${JOE_RIG_JS}</script>
<script>
(function () {
  var stage = document.getElementById("smStage");
  var a = document.getElementById(${JSON.stringify(audioId)});
  var dataEl = document.getElementById("smData");
  if (!stage || !dataEl || !window.JoeRig) return;
  var data = JSON.parse(dataEl.textContent || "{}");
  var rig = window.JoeRig.mount(stage.querySelector(".sm-joe"), data, a);
  var line = document.getElementById("smLine"), sec = document.getElementById("smSec"), shown = -1;
  window.joeStage = {
    update: function (ms, durMs, playing) {
      var i = rig.update(ms, durMs, playing);
      if (i !== shown) {
        shown = i;
        var b = data.beats[i] || { text: "", sec: "" };
        line.textContent = b.text;
        sec.textContent = b.sec;
      }
      return i;
    }
  };
  ${
    opts.external
      ? ""
      : `function loop() {
    var d = a && a.duration && isFinite(a.duration) ? a.duration * 1000 : 0;
    window.joeStage.update(a ? a.currentTime * 1000 : 0, d, !!a && !a.paused && !a.ended);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);`
  }
})();
</script>`;
}

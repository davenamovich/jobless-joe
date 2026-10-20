/**
 * Sit-down with Joe — a 9:16 talk-show video: stick-figure Joe behind his
 * desk delivers a monologue (or interviews a guest on the couch) from a
 * script and/or an audio file. Captions follow the script; mouths follow
 * the audio's loudness.
 *
 * Same recorder contract as the stickman song video (stickman-video.ts), so
 * the same here.now preview → "Make MP4" flow films it:
 *   - ?record=1 waits for window.startShow() and runs on the wall clock;
 *   - window.VESSEL.recordDurationMs says how long to film;
 *   - the page's own <audio> is mixed in by the recorder.
 *
 * Script format: plain lines are Joe's. "GUEST NAME: line" puts a guest on
 * the couch; "JOE:" (or "HOST:") switches back to Joe. Expression tags for
 * Fish Audio ([excited], [laugh], <whisper>…</whisper>; a (stage direction)
 * counts as one) are voiced but never shown in the captions.
 */

export type SitdownGesture = "rest" | "talk" | "cards" | "point" | "shrug" | "listen";

export interface SitdownLine {
  speaker: "joe" | "guest";
  /** Display name for the caption. */
  name: string;
  text: string;
  /** The line as voiced: `text` plus its expression tags. */
  spoken: string;
  gesture: SitdownGesture;
}

export interface SitdownScript {
  lines: SitdownLine[];
  /** The guest's name, or null for a solo monologue. */
  guest: string | null;
}

export interface SitdownVideoData {
  title: string;
  script: SitdownScript;
  /** File name as published next to index.html, e.g. "talk.mp3". */
  audioFile: string;
  /** Best guess at the length; the page corrects it once the audio loads. */
  durationSec: number;
  /** Exact start of each line in ms (known when we voiced the script). */
  startsMs?: number[];
}

/** How long the end card holds after the talk. */
export const SITDOWN_END_MS = 2500;

const JOE_LABEL = /^(jobless\s+joe|joe|host)$/i;
const MAX_CAPTION = 120;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}

/** Split a long paragraph into caption-sized pieces on sentence breaks. */
function captionChunks(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+(?:["')\]]|<\/[a-z]+>)*|[^.!?…]+$/gi) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (cur && (cur + " " + s).length > MAX_CAPTION) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function gestureFor(text: string, i: number): SitdownGesture {
  if (/\?\s*$/.test(text)) return "shrug";
  if (/!/.test(text)) return "point";
  return (["talk", "cards", "talk", "rest"] as const)[i % 4];
}

const SCOPED_TAG = /<\/?[a-z][\w -]{0,30}>/gi;

/** A line without its expression tags: what the captions show. */
export function stripExpressionTags(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(SCOPED_TAG, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSitdownScript(script: string): SitdownScript {
  const lines: SitdownLine[] = [];
  let guest: string | null = null;
  let speaker: "joe" | "guest" = "joe";
  let joeCount = 0;
  for (const rawLine of script.replace(/\r/g, "").split("\n")) {
    // (laughs) is a direction too: voice it as a Fish tag.
    let text = rawLine.replace(/\(([^)]*)\)/g, " [$1] ").replace(/\s+/g, " ").trim();
    if (!stripExpressionTags(text)) continue;
    // "[excited] SARAH: …" — leading tags may come before the speaker label.
    const lead = /^((?:\[[^\]]*\]\s*)*)([\s\S]*)$/.exec(text)!;
    const label = /^([A-Za-z][\w .'-]{0,24}?)\s*:\s*(.*)$/.exec(lead[2]);
    if (label) {
      const name = label[1].trim();
      if (JOE_LABEL.test(name)) speaker = "joe";
      else {
        speaker = "guest";
        guest = guest ?? titleCase(name);
      }
      text = `${lead[1]}${label[2]}`.trim();
      if (!stripExpressionTags(text)) continue;
    }
    for (const spoken of captionChunks(text)) {
      const chunk = stripExpressionTags(spoken);
      if (!chunk) continue;
      if (speaker === "joe") {
        lines.push({ speaker, name: "Joe", text: chunk, spoken, gesture: gestureFor(chunk, joeCount++) });
      } else {
        lines.push({ speaker, name: guest ?? "Guest", text: chunk, spoken, gesture: "listen" });
      }
    }
  }
  return { lines, guest };
}

/** Rough speaking length of a script, for when the audio can't be measured. */
export function estimateSpeechSec(script: SitdownScript): number {
  const words = script.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  return Math.max(5, Math.round(words / 2.5 + script.lines.length * 0.35));
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Night skyline through the studio window: same every time for a title. */
function skyline(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
  let out = "";
  for (let x = 144; x < 356; ) {
    const w = 18 + Math.floor(rnd() * 22);
    const top = 96 + Math.floor(rnd() * 60);
    out += `<rect x="${x}" y="${top}" width="${w}" height="${184 - top}" fill="#1b2740"/>`;
    for (let wy = top + 6; wy < 178; wy += 10)
      for (let wx = x + 4; wx < x + w - 4; wx += 7)
        if (rnd() < 0.35) out += `<rect x="${wx}" y="${wy}" width="3" height="4" fill="#d3a85f" opacity=".75"/>`;
    x += w + 2;
  }
  return out;
}

function sceneSvg(title: string, hasGuest: boolean): string {
  const curtain = (flip: boolean) =>
    `<g${flip ? ' transform="translate(500 0) scale(-1 1)"' : ""}><path d="M0 0 L96 0 Q72 120 86 250 Q62 330 78 440 L0 440 Z" fill="#7a1f28"/><path d="M28 0 Q20 200 30 440 M58 0 Q46 180 56 440" stroke="#5b141c" stroke-width="5" fill="none"/></g>`;
  const guest = hasGuest
    ? `<rect x="352" y="244" width="98" height="120" rx="22" fill="#5a2a30"/>
<g id="guest" class="sd-fig">
  <path class="sm-ink" id="gTorso" fill="none"/>
  <path class="sm-ink" id="gLegs" fill="none"/>
  <path class="sm-ink" id="gArmL" fill="none"/><path class="sm-ink" id="gArmR" fill="none"/>
  <g id="gHead"><circle r="26" class="sm-ink sm-paper"/><path d="M-26 -6 Q0 -40 26 -6 Z" fill="#5fb3a8" class="sm-ink sm-thin"/><path d="M-22 -7 L-40 -4" class="sm-ink sm-thin" fill="none"/>
    <g id="gEyes"><circle cx="-9" cy="2" r="3.2" class="sm-dot"/><circle cx="9" cy="2" r="3.2" class="sm-dot"/></g>
    <ellipse id="gMouthO" cx="0" cy="13" rx="6" ry="2" class="sm-dot" display="none"/><path id="gMouth" d="M-8 12 Q0 18 8 12" class="sm-ink sm-thin" fill="none"/></g>
</g>
<rect x="344" y="330" width="114" height="40" rx="12" fill="#6b3238"/>
<path d="M356 370 L352 392 M446 370 L450 392" class="sm-ink sm-thin" fill="none"/>`
    : "";
  return `<svg class="sd-svg" viewBox="0 0 500 440" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="500" height="440" fill="#23130f"/>
<rect x="140" y="34" width="220" height="150" rx="6" fill="#0d1628"/>
<circle cx="322" cy="66" r="13" fill="#f6ecda" opacity=".85"/>
${skyline(title)}
<path d="M250 34 L250 184 M140 109 L360 109" stroke="#d3a85f" stroke-width="2" opacity=".5"/>
<rect x="140" y="34" width="220" height="150" rx="6" fill="none" stroke="#d3a85f" stroke-width="3"/>
${curtain(false)}${curtain(true)}
<rect width="500" height="16" fill="#8e2430"/><rect y="16" width="500" height="2" fill="#d3a85f"/>
<rect y="392" width="500" height="48" fill="#160c0a"/>
${guest}
<rect x="144" y="200" width="92" height="136" rx="18" fill="#3a1c20"/>
<g id="joe" class="sd-fig">
  <path class="sm-ink" id="jTorso" fill="none"/>
  <path class="sm-ink sm-thin" id="jTie" fill="#b8434f" d="M-5 2 L5 2 L3 10 L8 44 L0 54 L-8 44 L-3 10 Z"/>
  <path class="sm-ink" id="jArmL" fill="none"/><path class="sm-ink" id="jArmR" fill="none"/>
  <g id="jCards" display="none"><rect x="-22" y="-16" width="44" height="30" rx="3" fill="#f6ecda" transform="rotate(-6)"/><path d="M-14 -8 L12 -11 M-14 -1 L8 -3" stroke="#b8434f" stroke-width="2" transform="rotate(-6)"/></g>
  <g id="jHead"><circle r="30" class="sm-ink sm-paper"/>
    <g id="jEyes"><circle cx="-11" cy="-5" r="3.6" class="sm-dot"/><circle cx="11" cy="-5" r="3.6" class="sm-dot"/></g>
    <g id="jWink" display="none"><circle cx="-11" cy="-5" r="3.6" class="sm-dot"/><path d="M5 -4 Q11 -11 17 -4" class="sm-ink sm-thin" fill="none"/></g>
    <ellipse id="jMouthO" cx="0" cy="13" rx="7" ry="2" class="sm-dot" display="none"/><path id="jMouth" d="M-11 9 Q0 19 11 9" class="sm-ink sm-thin" fill="none"/></g>
</g>
<rect x="30" y="316" width="320" height="14" rx="3" fill="#7a4a28"/>
<rect x="44" y="330" width="292" height="64" fill="#4e2c18"/>
<path d="M44 336 L336 336" stroke="#d3a85f" stroke-width="2" opacity=".6"/>
<g transform="translate(244 298)"><path d="M0 18 L8 0 L88 0 L96 18 Z" fill="#d3a85f"/><text x="48" y="13" text-anchor="middle" font-family="Georgia,serif" font-size="10" font-weight="700" letter-spacing="1" fill="#2a1610">JOBLESS JOE</text></g>
<g transform="translate(64 288)"><rect width="24" height="28" rx="3" fill="#f6ecda"/><path d="M24 6 Q34 10 24 20" stroke="#f6ecda" stroke-width="4" fill="none"/><text x="12" y="19" text-anchor="middle" font-family="Georgia,serif" font-size="9" font-weight="700" fill="#b8434f">#1</text><path class="sd-steam" d="M8 -4 Q12 -10 8 -16 M16 -4 Q20 -10 16 -16" stroke="#f6ecda" stroke-width="2" fill="none" opacity=".6"/></g>
<rect x="98" y="306" width="44" height="10" rx="1" fill="#efe6d2" transform="rotate(-4 120 311)"/>
<g><ellipse cx="226" cy="316" rx="12" ry="3" fill="#9ca3af"/><path d="M226 316 L218 276" stroke="#9ca3af" stroke-width="3"/><rect x="208" y="262" width="12" height="20" rx="6" fill="#6b7280" transform="rotate(-30 214 272)"/></g>
</svg>`;
}

/**
 * The browser engine: poses glide between gestures, mouths open with the
 * audio's loudness, Joe blinks, breathes, nods at his guest and winks on
 * his last line. Plain ES5 in a string so the bundler never touches it.
 */
const SITDOWN_JS = String.raw`
(function () {
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  // [elbowX, elbowY, handX, handY] for each arm.
  var JOE = {
    rest:   { L: [152, 290, 178, 312], R: [228, 290, 202, 312] },
    talk:   { L: [152, 290, 178, 312], R: [240, 282, 264, 250] },
    cards:  { L: [150, 286, 172, 292], R: [230, 286, 208, 292] },
    point:  { L: [152, 290, 178, 312], R: [234, 256, 258, 204] },
    shrug:  { L: [140, 262, 116, 236], R: [240, 262, 264, 236] },
    listen: { L: [152, 290, 180, 312], R: [230, 308, 198, 222] }
  };
  var GUEST = { rest: { L: [374, 306, 368, 334], R: [426, 306, 434, 334] }, talk: { L: [374, 306, 368, 334], R: [434, 294, 454, 266] } };
  function lerp(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function arm(sx, sy, p) { return "M" + sx + " " + sy + " L" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " L" + p[2].toFixed(1) + " " + p[3].toFixed(1); }

  window.SitDown = {
    mount: function (data, audio) {
      var lines = data.lines, starts = data.starts, hasGuest = !!$("guest");
      var env = null;
      (function analyse() {
        var src = audio && (audio.currentSrc || audio.getAttribute("src"));
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!src || !Ctx) return;
        fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
          var ctx = new Ctx();
          return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); }).then(function (ab) {
            try { ctx.close(); } catch (e) {}
            var ch = ab.getChannelData(0), hop = Math.round(ab.sampleRate / 50), n = Math.floor(ch.length / hop), i, j, s, v;
            var e = new Float32Array(n);
            for (i = 0; i < n; i++) { s = 0; for (j = i * hop; j < (i + 1) * hop; j++) { v = ch[j]; s += v * v; } e[i] = Math.sqrt(s / hop); }
            var sorted = Array.prototype.slice.call(e).sort(function (a, b) { return a - b; });
            var top = sorted[Math.floor(n * 0.95)] || 1;
            for (i = 0; i < n; i++) e[i] = clamp(e[i] / top, 0, 1);
            env = e;
          });
        }).catch(function () {});
      })();
      function loud(ms) {
        if (env) { var i = Math.floor(ms / 20); return i >= 0 && i < env.length ? env[i] : 0; }
        return 0.4 + 0.4 * Math.sin(ms / 90) * Math.sin(ms / 230); // no audio data: plausible chatter
      }
      // Line start times: exact when known, else shared out by word count.
      var weights = lines.map(function (l) { return l.text.split(/\s+/).length + 1; });
      var total = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
      function lineAt(ms, durMs) {
        var idx = -1, k, acc = 0;
        for (k = 0; k < lines.length; k++) {
          var at = starts ? starts[k] : (acc / total) * durMs;
          acc += weights[k];
          if (ms >= at) idx = k;
        }
        return idx;
      }

      var jArmL = $("jArmL"), jArmR = $("jArmR"), jTorso = $("jTorso"), jTie = $("jTie"), jHead = $("jHead"), jEyes = $("jEyes"), jWink = $("jWink");
      var jMouth = $("jMouth"), jMouthO = $("jMouthO"), jCards = $("jCards");
      var cap = $("cap"), who = $("who");
      var g = hasGuest ? { torso: $("gTorso"), legs: $("gLegs"), L: $("gArmL"), R: $("gArmR"), head: $("gHead"), eyes: $("gEyes"), m: $("gMouth"), mo: $("gMouthO") } : null;
      var from = JOE.rest, to = JOE.rest, poseAt = 0, gFrom = GUEST.rest, gTo = GUEST.rest, gAt = 0;
      var lastIdx = -2, nextBlink = 1800, blinkUntil = 0, t0 = performance.now(), lastLoud = 0;

      function mouth(path, oval, open) {
        if (open > 0.08) {
          path.setAttribute("display", "none");
          oval.setAttribute("display", "inline");
          oval.setAttribute("ry", (1.5 + 8 * open).toFixed(1));
        } else {
          path.setAttribute("display", "inline");
          oval.setAttribute("display", "none");
        }
      }

      return {
        update: function (ms, durMs, playing) {
          var now = performance.now(), t = (now - t0) / 1000;
          var idx = lineAt(ms, durMs), line = idx >= 0 ? lines[idx] : null;
          var speaker = line ? line.speaker : "joe";
          var gesture = line ? line.gesture : lines.length ? "rest" : ["talk", "rest", "cards", "point"][Math.floor(ms / 4000) % 4];
          if (!playing && ms === 0) gesture = "rest";
          if (idx !== lastIdx) {
            lastIdx = idx;
            if (line) {
              cap.textContent = line.text;
              who.textContent = hasGuest ? line.name : "";
              cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in");
            } else if (!lines.length) {
              cap.textContent = "";
            }
          }
          var target = JOE[gesture] || JOE.rest;
          if (target !== to) { from = { L: lerp(from.L, to.L, ease(clamp((now - poseAt) / 450, 0, 1))), R: lerp(from.R, to.R, ease(clamp((now - poseAt) / 450, 0, 1))) }; to = target; poseAt = now; }
          var k = ease(clamp((now - poseAt) / 450, 0, 1));
          var L = lerp(from.L, to.L, k), R = lerp(from.R, to.R, k);

          var lv = playing ? loud(ms) : 0;
          lastLoud += (lv - lastLoud) * 0.5;
          var joeTalks = playing && speaker === "joe", guestTalks = playing && speaker === "guest";
          // The talking hand moves with the voice.
          if (joeTalks && (gesture === "talk" || gesture === "point" || gesture === "shrug")) {
            R[2] += Math.sin(t * 7) * 7 * lastLoud; R[3] += Math.cos(t * 5) * 6 * lastLoud;
            if (gesture === "shrug") { L[2] -= Math.sin(t * 7) * 5 * lastLoud; }
          }
          var breathe = Math.sin(t * 1.7) * 1.4, lean = joeTalks ? lastLoud * 3 : 0;
          var neckY = 216 + breathe + lean, sY = 236 + breathe + lean;
          jTorso.setAttribute("d", "M190 " + neckY.toFixed(1) + " L190 330");
          jTie.setAttribute("transform", "translate(190 " + neckY.toFixed(1) + ")");
          jArmL.setAttribute("d", arm(190, sY.toFixed(1), L));
          jArmR.setAttribute("d", arm(190, sY.toFixed(1), R));
          jCards.setAttribute("display", gesture === "cards" ? "inline" : "none");
          jCards.setAttribute("transform", "translate(190 " + (284 + breathe).toFixed(1) + ")");
          // Head: tilts while he talks, turns and nods toward a talking guest.
          var hx = 190, tilt = Math.sin(t * 0.9) * 3;
          if (joeTalks) tilt += (lastLoud - 0.3) * 6;
          if (speaker === "guest" && line) { hx += 5; tilt = 7 + Math.sin(t * 3.2) * 2.5; }
          jHead.setAttribute("transform", "translate(" + hx + " " + (186 + breathe + lean).toFixed(1) + ") rotate(" + tilt.toFixed(1) + ")");
          jEyes.setAttribute("transform", (speaker === "guest" && line ? "translate(4 0) " : "") + (now < blinkUntil ? "translate(0 -4.5) scale(1 .1)" : ""));
          if (now > nextBlink + t0) { blinkUntil = now + 120; nextBlink = now - t0 + 2200 + Math.random() * 3000; }
          var lastLine = idx === lines.length - 1 && speaker === "joe";
          var winking = lastLine && Math.sin(t * 1.3) > 0.6;
          jWink.setAttribute("display", winking ? "inline" : "none");
          jEyes.setAttribute("display", winking ? "none" : "inline");
          mouth(jMouth, jMouthO, joeTalks ? clamp((lastLoud - 0.1) / 0.6, 0, 1) : 0);

          if (g) {
            var gt = guestTalks ? GUEST.talk : GUEST.rest;
            if (gt !== gTo) { gFrom = gTo; gTo = gt; gAt = now; }
            var gk = ease(clamp((now - gAt) / 450, 0, 1));
            var gl = lerp(gFrom.L, gTo.L, gk), gr = lerp(gFrom.R, gTo.R, gk);
            if (guestTalks) { gr[2] += Math.sin(t * 6) * 6 * lastLoud; gr[3] += Math.cos(t * 4) * 5 * lastLoud; }
            var gb = Math.sin(t * 1.5 + 1) * 1.2;
            g.torso.setAttribute("d", "M400 " + (252 + gb).toFixed(1) + " L404 344");
            g.legs.setAttribute("d", "M404 344 L444 342 L448 392 M404 344 L436 352 L424 392");
            g.L.setAttribute("d", arm(401, (268 + gb).toFixed(1), gl));
            g.R.setAttribute("d", arm(401, (268 + gb).toFixed(1), gr));
            var gtilt = guestTalks ? -4 + (lastLoud - 0.3) * 6 : -6 + Math.sin(t * 2.6) * (speaker === "joe" && line ? 2 : 0.5);
            g.head.setAttribute("transform", "translate(400 " + (226 + gb).toFixed(1) + ") rotate(" + gtilt.toFixed(1) + ")");
            g.eyes.setAttribute("transform", "translate(-3 0)" + (now < blinkUntil - 60 ? " translate(0 1.8) scale(1 .1)" : ""));
            mouth(g.m, g.mo, guestTalks ? clamp((lastLoud - 0.1) / 0.6, 0, 1) : 0);
          }
        }
      };
    }
  };
})();
`;

export function buildSitdownVideoHtml(data: SitdownVideoData): string {
  const title = esc(data.title || "A Sit-Down with Joe");
  const { lines, guest } = data.script;
  const durationMs = Math.max(5000, Math.round((data.durationSec || 60) * 1000));
  const payload = JSON.stringify({
    lines: lines.map((l) => ({ speaker: l.speaker, name: l.name, text: l.text, gesture: l.gesture })),
    starts: data.startsMs && data.startsMs.length === lines.length ? data.startsMs : null,
  }).replace(/</g, "\\u003c");
  const sub = guest ? `Joe sits down with ${esc(guest)}` : "A sit-down with Joe";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Jobless Joe</title>
<meta property="og:title" content="${title} — Jobless Joe" />
<meta property="og:description" content="${sub}." />
<style>
  :root{--ink:#f6ecda;--dim:#c9b79e;--gold:#d3a85f;--panel:#201414;--bg:#160e0d}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Georgia,'Iowan Old Style','Times New Roman',serif;-webkit-font-smoothing:antialiased}
  body{background:radial-gradient(900px 700px at 50% -8%,#4a1b20 0%,transparent 64%),var(--bg)}
  .frame{position:fixed;inset:0;margin:0 auto;max-width:calc(100vh * 9 / 16);display:flex;flex-direction:column;padding:5vh 5% 3vh}
  .eyebrow{font:600 clamp(10px,1.5vh,14px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);text-align:center}
  h1{font-size:clamp(24px,4.2vh,44px);line-height:1.05;text-align:center;margin:1.4vh 0 .4vh;letter-spacing:-.01em}
  .ep{font:600 clamp(10px,1.4vh,13px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);text-align:center}
  .stage{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;margin-top:2.2vh}
  .sd-svg{display:block;width:100%;height:auto;max-height:46vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  .sm-ink{stroke:var(--ink);stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
  .sm-thin{stroke-width:4}
  .sm-paper{fill:var(--panel)}
  .sm-dot{fill:var(--ink)}
  .sd-steam{animation:steam 1.6s ease-in-out infinite}
  @keyframes steam{50%{transform:translateY(-3px);opacity:.25}}
  .who{min-height:1.2em;margin-top:2vh;text-align:center;font:700 clamp(10px,1.5vh,14px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
  .cap{min-height:4.2em;padding:1vh 4% 0;text-align:center;font-style:italic;font-size:clamp(19px,3.1vh,34px);line-height:1.3}
  .cap.in{animation:capin .35s ease both}
  @keyframes capin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .bar{height:4px;border-radius:99px;background:rgba(246,236,218,.14);overflow:hidden;margin-top:1.6vh}
  .bar i{display:block;height:100%;width:0;background:var(--gold)}
  .foot{margin-top:1.4vh;text-align:center;font:600 clamp(9px,1.3vh,12px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.24em;color:var(--dim);opacity:.7;text-transform:uppercase}
  .tap,.end{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vh;text-align:center;z-index:5}
  .tap{background:rgba(10,6,6,.55);cursor:pointer}
  .tap b{width:13vh;height:13vh;border-radius:50%;display:grid;place-items:center;font-size:5vh;background:radial-gradient(circle at 35% 30%,#7d343d,#4a1a20);border:1px solid rgba(211,168,95,.6);box-shadow:0 18px 50px rgba(0,0,0,.5)}
  .tap span{font:600 clamp(11px,1.6vh,15px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
  .end{display:none;background:var(--bg)}
  .end.on{display:flex;animation:fade .5s ease both}
  .end h2{font-size:clamp(28px,5vh,54px);line-height:1.05;padding:0 8%}
  .end p{font:600 clamp(11px,1.6vh,15px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  html.rec .tap{display:none}
  @media (prefers-reduced-motion:reduce){.sd-steam,.cap.in{animation:none}}
</style>
</head>
<body>
<main class="frame">
  <div class="eyebrow">Jobless Joe</div>
  <h1>${title}</h1>
  <div class="ep">${sub}</div>
  <div class="stage">
    ${sceneSvg(data.title || "", !!guest)}
    <div class="who" id="who"></div>
    <div class="cap" id="cap"></div>
  </div>
  <div class="bar"><i id="prog"></i></div>
  <div class="foot">The Sit-Down</div>
</main>
<div class="tap" id="tap" role="button" aria-label="Play"><b>▶</b><span>Tap to play</span></div>
<div class="end" id="end"><h2>${title}</h2><p>Jobless Joe</p></div>
<audio id="a" preload="auto" src="${esc(data.audioFile)}"></audio>
<script>${SITDOWN_JS}</script>
<script>
(function () {
  var RECORD = /[?&]record=1\\b/.test(location.search);
  if (RECORD) document.documentElement.classList.add("rec");
  var END_MS = ${SITDOWN_END_MS};
  var durMs = ${durationMs};
  window.VESSEL = { recordDurationMs: durMs + END_MS, isInteractive: true, beatMs: 0 };

  var a = document.getElementById("a");
  var prog = document.getElementById("prog");
  var end = document.getElementById("end");
  var tap = document.getElementById("tap");
  var show = window.SitDown.mount(${payload}, a);

  a.addEventListener("loadedmetadata", function () {
    if (a.duration && isFinite(a.duration)) {
      durMs = Math.round(a.duration * 1000);
      window.VESSEL.recordDurationMs = durMs + END_MS;
    }
  });

  // Recording: wall clock (the recorder mixes the audio itself).
  // Watching: the audio's own clock, so pausing holds Joe too.
  var started = false, t0 = 0, endedAt = 0;
  a.addEventListener("ended", function () { endedAt = Date.now(); });
  function clock() {
    if (!started) return 0;
    if (RECORD) return Date.now() - t0;
    if (endedAt) return durMs + (Date.now() - endedAt);
    return a.currentTime * 1000;
  }
  function tick() {
    var ms = clock();
    var playing = started && ms < durMs && (RECORD || !a.paused);
    show.update(Math.min(ms, durMs), durMs, playing);
    prog.style.width = (Math.min(1, ms / durMs) * 100).toFixed(2) + "%";
    if (ms >= durMs) end.classList.add("on");
    if (!started || ms < durMs + END_MS) requestAnimationFrame(tick);
  }
  function startShow() {
    if (started) return;
    started = true;
    t0 = Date.now();
    tap.style.display = "none";
    if (!RECORD) a.play().catch(function () {});
  }
  window.startShow = startShow;
  tap.addEventListener("click", startShow);
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}

/**
 * Stickman video page — a 9:16, full-screen "music video" of a finished
 * song: stick-figure Joe acts out each lyric line on a crooner stage while
 * the MP3 plays. Published to here.now as a temp page first; if it looks
 * right, the same page is filmed to MP4 by Plunder & Riffle's request_mp4.
 *
 * Recorder contract (meme-loop-engine's video/recorder.ts):
 *   - it loads the page with ?record=1 and calls window.startShow(), so the
 *     page must not start on its own then, and runs on the wall clock;
 *   - window.VESSEL.recordDurationMs says how long to film (song + end card);
 *   - the page's own <audio> is mixed into the MP4 by the recorder.
 * A person opening the link gets a tap-to-play overlay instead (browsers
 * block autoplay with sound), and Joe follows the song's own clock.
 */

import { STICKMAN_STAGE_CSS, lyricsToBeats, stickmanStageHtml } from "./stickman";

export interface StickmanVideoData {
  title: string;
  episodeLabel: string;
  lyrics: string;
  /** File name as published next to index.html, e.g. "song.mp3". */
  audioFile: string;
  /** Best guess at the song length; the page corrects it once the audio loads. */
  durationSec: number;
}

/** How long the end card holds after the song. */
export const END_CARD_MS = 2500;

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStickmanVideoHtml(data: StickmanVideoData): string {
  const title = esc(data.title || "Untitled Song");
  const label = esc(data.episodeLabel || "Jobless Joe");
  const beats = lyricsToBeats(data.lyrics);
  const stage =
    stickmanStageHtml(beats.length ? beats : [{ text: data.title || "", pose: "sing", expression: "smug", prop: "mic" }], "#b8434f");
  const durationMs = Math.max(5000, Math.round((data.durationSec || 60) * 1000));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Jobless Joe</title>
<meta property="og:title" content="${title} — Jobless Joe" />
<meta property="og:description" content="Stick-figure Joe acts out the song." />
<style>
  :root{--ink:#f6ecda;--dim:#c9b79e;--gold:#d3a85f;--panel:#201414;--bg:#160e0d;--line:rgba(246,236,218,.14)}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Georgia,'Iowan Old Style','Times New Roman',serif;-webkit-font-smoothing:antialiased}
  body{background:radial-gradient(900px 700px at 50% -8%,#4a1b20 0%,transparent 64%),var(--bg)}
  .frame{position:fixed;inset:0;margin:0 auto;max-width:calc(100vh * 9 / 16);display:flex;flex-direction:column;padding:5vh 5% 3vh}
  .eyebrow{font:600 clamp(10px,1.5vh,14px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);text-align:center}
  h1{font-size:clamp(24px,4.4vh,46px);line-height:1.05;text-align:center;margin:1.4vh 0 .4vh;letter-spacing:-.01em}
  .ep{font:600 clamp(10px,1.4vh,13px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);text-align:center}
  .sm-stage{--sm-ink:var(--ink);--sm-paper:var(--panel);--sm-accent:var(--gold)}
${STICKMAN_STAGE_CSS}
  .sm-stage{flex:1;margin:2.4vh 0 0;border:0;border-radius:0;background:radial-gradient(55% 60% at 50% 18%,rgba(255,236,196,.17),transparent 72%);display:flex;flex-direction:column;justify-content:center;min-height:0}
  .sm-joe{max-height:52vh}
  .sm-line{font-style:italic;font-size:clamp(20px,3.3vh,36px);line-height:1.3;min-height:4.2em;padding:1.2vh 4% 0}
  .sm-sec{top:0;left:50%;transform:translateX(-50%)}
  .bar{height:4px;border-radius:99px;background:rgba(246,236,218,.14);overflow:hidden;margin-top:2vh}
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
</style>
</head>
<body>
<main class="frame">
  <div class="eyebrow">Jobless Joe</div>
  <h1>${title}</h1>
  <div class="ep">${label}</div>
  ${stage}
  <div class="bar"><i id="prog"></i></div>
  <div class="foot">Crooner Song Engine</div>
</main>
<div class="tap" id="tap" role="button" aria-label="Play"><b>▶</b><span>Tap to play</span></div>
<div class="end" id="end"><h2>${title}</h2><p>Jobless Joe</p></div>
<audio id="a" preload="auto" src="${esc(data.audioFile)}"></audio>
<script>
(function () {
  var RECORD = /[?&]record=1\\b/.test(location.search);
  if (RECORD) document.documentElement.classList.add("rec");
  var END_MS = ${END_CARD_MS};
  var durMs = ${durationMs};
  window.VESSEL = { recordDurationMs: durMs + END_MS, isInteractive: true, beatMs: 0 };

  var a = document.getElementById("a");
  var stage = document.getElementById("smStage");
  var beats = stage.querySelectorAll(".sm-beat");
  var line = document.getElementById("smLine");
  var sec = document.getElementById("smSec");
  var prog = document.getElementById("prog");
  var end = document.getElementById("end");
  var tap = document.getElementById("tap");
  var at = Array.prototype.map.call(beats, function (b) { return Number(b.getAttribute("data-at")) || 0; });

  // The real length, once the browser has read it.
  a.addEventListener("loadedmetadata", function () {
    if (a.duration && isFinite(a.duration)) {
      durMs = Math.round(a.duration * 1000);
      window.VESSEL.recordDurationMs = durMs + END_MS;
    }
  });

  var cur = -1, started = false, t0 = 0;
  function show(i) {
    if (i === cur) return;
    if (cur >= 0) beats[cur].classList.remove("on", "drawing");
    cur = i;
    var b = beats[i];
    b.classList.add("on");
    void b.getBoundingClientRect();
    b.classList.add("drawing");
    line.textContent = b.getAttribute("data-line") || "";
    sec.textContent = b.getAttribute("data-sec") || "";
  }
  // Recording: wall clock (the recorder mixes the audio itself).
  // Watching: the song's own clock, so pausing or a stall holds Joe too;
  // after the song ends, the end card runs on the wall clock.
  var endedAt = 0;
  a.addEventListener("ended", function () { endedAt = Date.now(); });
  function clock() {
    if (RECORD) return Date.now() - t0;
    if (endedAt) return durMs + (Date.now() - endedAt);
    return a.currentTime * 1000;
  }
  function tick() {
    var ms = clock();
    var f = Math.min(1, ms / durMs), i = 0;
    for (var k = 0; k < at.length; k++) if (f >= at[k]) i = k;
    show(i);
    prog.style.width = (f * 100).toFixed(2) + "%";
    if (ms >= durMs) { end.classList.add("on"); stage.classList.remove("live"); }
    if (ms < durMs + END_MS) requestAnimationFrame(tick);
  }
  function startShow() {
    if (started) return;
    started = true;
    t0 = Date.now();
    tap.style.display = "none";
    stage.classList.add("live");
    if (!RECORD) a.play().catch(function () {});
    requestAnimationFrame(tick);
  }
  window.startShow = startShow;
  tap.addEventListener("click", startShow);
  beats[0].classList.remove("on");
  show(0);
})();
</script>
</body>
</html>`;
}

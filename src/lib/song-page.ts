/**
 * Standalone song page for here.now.
 *
 * Self-contained HTML (no Next.js, no external assets) that ships next to the
 * rendered MP3. Borrows the "song is the centerpiece" layout from StudioStack's
 * here.now template, but trimmed down to: title → player → download → lyrics.
 * With `stickman` on, a stage above the player has stick-figure Joe acting
 * out each lyric line in time with the song (see lib/stickman.ts).
 */

import { lyricsToBeats } from "./stickman";
import { STICKMAN_STAGE_CSS, stickmanStageHtml, stickmanStageScript } from "./stickman-rig";

export interface SongPageData {
  title: string;
  episodeLabel: string;
  episodeDuration: string;
  lyrics: string;
  musicalDirection?: string;
  /** File name as published, e.g. "song.mp3" */
  audioFile: string;
  /** Suggested download filename, e.g. "joe-discovers-ai.mp3" */
  downloadName: string;
  /** Fallback duration label when metadata isn't loaded yet. */
  durationSec?: number;
  /** Anonymous here.now pages expire; show the notice when true. */
  temporary?: boolean;
  /** Stick-figure Joe acts out the lyrics above the player. */
  stickman?: boolean;
  /** Measured start of each lyric beat (0..1); absent = word-count estimate. */
  lineStarts?: number[] | null;
}

/** Stickman stage on song pages unless SONG_PAGE_STICKMAN=0. */
export function songPageStickmanEnabled(): boolean {
  return process.env.SONG_PAGE_STICKMAN?.trim() !== "0";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function niceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Turn lyrics into escaped lines; section tags like [Chorus] get styled. */
function lyricsHtml(lyrics: string): string {
  const lines = String(lyrics ?? "").split(/\r?\n/);
  return lines
    .map((raw) => {
      const line = raw.trim();
      if (!line) return `<div class="gap"></div>`;
      const tag = /^\[([^\]]+)\]$/.exec(line);
      if (tag) return `<div class="tag">${escapeHtml(tag[1])}</div>`;
      return `<div class="line">${escapeHtml(line)}</div>`;
    })
    .join("\n        ");
}

export function buildSongPageHtml(data: SongPageData): string {
  const title = escapeHtml(data.title || "Untitled Song");
  const episode = escapeHtml(data.episodeLabel || "Jobless Joe");
  const direction = escapeHtml(data.musicalDirection || "");
  const description = escapeHtml(
    (data.musicalDirection || data.lyrics || "A Jobless Joe crooner song.")
      .replace(/\s+/g, " ")
      .slice(0, 180)
  );
  const audioFile = escapeHtml(data.audioFile);
  const downloadName = escapeHtml(data.downloadName);
  const fallbackDuration = niceTime(data.durationSec ?? 0);
  const stage = data.stickman ? stickmanStageHtml(lyricsToBeats(data.lyrics), "#b8434f", data.lineStarts) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Jobless Joe</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="music.song" />
<meta property="og:title" content="${title} — Jobless Joe" />
<meta property="og:description" content="${description}" />
<meta property="og:audio" content="${audioFile}" />
<meta property="og:audio:type" content="audio/mpeg" />
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="${title} — Jobless Joe" />
<meta name="twitter:description" content="${description}" />
<style>
  :root{
    --ink:#f6ecda; --dim:#c9b79e; --gold:#d3a85f; --wine:#6f2a32;
    --bg:#160e0d; --panel:#201414; --line:rgba(246,236,218,.14);
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    min-height:100vh; color:var(--ink); background:
      radial-gradient(1100px 620px at 50% -10%, #4a1b20 0%, transparent 62%),
      radial-gradient(900px 500px at 90% 18%, #2a1613 0%, transparent 60%),
      var(--bg);
    font-family:Georgia,'Iowan Old Style','Times New Roman',serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:760px;margin:0 auto;padding:44px 22px 56px}
  .eyebrow{
    display:flex;align-items:center;gap:10px;letter-spacing:.24em;
    text-transform:uppercase;font-size:10.5px;color:var(--gold);
    font-family:ui-sans-serif,system-ui,sans-serif;
  }
  .eyebrow:before{content:"";width:26px;height:1px;background:var(--gold);display:block}
  .hero{display:flex;gap:26px;align-items:center;margin:26px 0 26px}
  .disc{
    width:118px;height:118px;border-radius:50%;flex:0 0 118px;position:relative;
    background:
      repeating-radial-gradient(circle at 50% 50%, #171010 0 2px, #211515 2px 4px);
    border:1px solid rgba(211,168,95,.35);
    box-shadow:0 18px 50px rgba(0,0,0,.55), inset 0 0 30px rgba(0,0,0,.7);
    animation:spin 7s linear infinite;animation-play-state:paused;
  }
  .disc.playing{animation-play-state:running}
  .disc:after{
    content:"";position:absolute;inset:41px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #a9454f, var(--wine) 70%);
    box-shadow:inset 0 0 0 1px rgba(246,236,218,.16);
  }
  .disc:before{
    content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;
    margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#120c0b;z-index:2;
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:clamp(30px,5.4vw,44px);line-height:1.04;margin:0 0 10px;letter-spacing:-.015em}
  .meta{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:var(--dim);letter-spacing:.06em;text-transform:uppercase}
  .meta b{color:var(--gold);font-weight:600}
  .player{
    margin-top:30px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));
    border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px;
    box-shadow:0 20px 60px rgba(0,0,0,.35);
  }
  .controls{display:flex;align-items:center;gap:16px}
  .play{
    width:56px;height:56px;border-radius:50%;border:1px solid rgba(211,168,95,.6);
    background:radial-gradient(circle at 35% 30%, #7d343d, #4a1a20);
    color:var(--ink);display:grid;place-items:center;cursor:pointer;flex:0 0 56px;
    transition:transform .15s ease, box-shadow .15s ease;
    box-shadow:0 10px 26px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12);
  }
  .play:hover{transform:translateY(-1px)}
  .play svg{width:22px;height:22px;display:block;margin-left:2px}
  .play .pauseIcon{display:none;margin-left:0}
  .playing .play .playIcon{display:none}
  .playing .play .pauseIcon{display:block}
  .track{flex:1;min-width:0}
  .bar{
    -webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:99px;
    background:linear-gradient(90deg,var(--gold) var(--p,0%), rgba(246,236,218,.18) var(--p,0%));
    outline:none;cursor:pointer;display:block;
  }
  .bar::-webkit-slider-thumb{
    -webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--ink);
    border:2px solid var(--gold);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);
  }
  .bar::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--ink);border:2px solid var(--gold)}
  .times{display:flex;justify-content:space-between;margin-top:9px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;color:var(--dim);letter-spacing:.06em}
  .download{
    display:flex;align-items:center;justify-content:center;gap:9px;margin-top:18px;
    background:linear-gradient(180deg,#e0b877,#c9964f);color:#241309;text-decoration:none;
    font-family:ui-sans-serif,system-ui,sans-serif;font-weight:700;font-size:13.5px;
    letter-spacing:.02em;padding:13px 18px;border-radius:11px;
    box-shadow:0 12px 30px rgba(201,150,79,.22);
  }
  .download:hover{filter:brightness(1.05)}
  .download svg{width:16px;height:16px}
  .direction{
    margin:26px 0 0;padding:16px 18px;border-left:2px solid var(--gold);
    background:rgba(255,255,255,.025);border-radius:0 10px 10px 0;
    color:var(--dim);font-size:14.5px;line-height:1.6;font-style:italic;
  }
  .lyrics{margin-top:34px;padding-top:26px;border-top:1px solid var(--line)}
  .lyrics h2{font-family:ui-sans-serif,system-ui,sans-serif;font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin:0 0 18px;font-weight:600}
  .line{font-size:17px;line-height:1.75;color:rgba(246,236,218,.92)}
  .tag{margin:18px 0 8px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);opacity:.85}
  .gap{height:10px}
  footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;color:var(--dim);letter-spacing:.04em}
  footer b{color:var(--gold);font-weight:600}
  .temp{font-size:11px;color:var(--dim);margin-top:10px;font-family:ui-sans-serif,system-ui,sans-serif}
  @media (max-width:560px){
    .hero{gap:18px}
    .disc{width:84px;height:84px;flex-basis:84px}
    .disc:after{inset:29px}
    .wrap{padding-top:30px}
    .line{font-size:16px}
  }
  @media (prefers-reduced-motion:reduce){.disc{animation:none}}
${stage ? `  .sm-stage{--sm-ink:var(--ink);--sm-paper:var(--panel);--sm-accent:var(--gold)}\n  .sm-line{font-family:Georgia,'Iowan Old Style',serif;font-style:italic}\n${STICKMAN_STAGE_CSS}` : ""}
</style>
</head>
<body>
  <main class="wrap">
    <div class="eyebrow">Jobless Joe · Crooner Song Engine</div>

    <section class="hero">
      <div class="disc" id="disc" aria-hidden="true"></div>
      <div>
        <h1>${title}</h1>
        <div class="meta"><b>${episode}</b> &nbsp;·&nbsp; ${escapeHtml(data.episodeDuration || "Song")}</div>
      </div>
    </section>

    ${stage}

    <section class="player" id="player">
      <audio id="a" preload="metadata" src="${audioFile}"></audio>
      <div class="controls">
        <button class="play" id="play" type="button" aria-label="Play song">
          <svg class="playIcon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.9l10.5-6.86a1.06 1.06 0 0 0 0-1.8L9.56 4.24A1.06 1.06 0 0 0 8 5.14Z"/></svg>
          <svg class="pauseIcon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>
        </button>
        <div class="track">
          <input class="bar" id="seek" type="range" min="0" max="1000" value="0" aria-label="Seek" />
          <div class="times"><span id="cur">0:00</span><span id="dur">${fallbackDuration}</span></div>
        </div>
      </div>
      <a class="download" href="${audioFile}" download="${downloadName}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>
        Download MP3
      </a>
      ${data.temporary ? `<div class="temp">This page is temporary — download the track to keep it.</div>` : ""}
    </section>

    ${
      direction
        ? `<p class="direction">${direction}</p>`
        : ""
    }

    <section class="lyrics">
      <h2>Lyrics</h2>
      ${lyricsHtml(data.lyrics)}
    </section>

    <footer>
      <span>Written &amp; performed by <b>Jobless Joe</b></span>
      <span>Made with the Crooner Song Engine</span>
    </footer>
  </main>

<script>
  (function () {
    var a = document.getElementById("a");
    var play = document.getElementById("play");
    var seek = document.getElementById("seek");
    var cur = document.getElementById("cur");
    var dur = document.getElementById("dur");
    var disc = document.getElementById("disc");
    var player = document.getElementById("player");
    if (!a || !play || !seek) return;

    function fmt(s) {
      if (!isFinite(s) || s < 0) s = 0;
      var m = Math.floor(s / 60);
      var r = Math.floor(s % 60);
      return m + ":" + (r < 10 ? "0" : "") + r;
    }
    function paint() {
      var d = a.duration || 0;
      var p = d ? (a.currentTime / d) * 100 : 0;
      seek.value = String(Math.round(p * 10));
      seek.style.setProperty("--p", p + "%");
      cur.textContent = fmt(a.currentTime);
      dur.textContent = d ? fmt(d) : dur.textContent;
    }
    play.addEventListener("click", function () {
      if (a.paused) a.play(); else a.pause();
    });
    a.addEventListener("play", function () {
      disc.classList.add("playing");
      player.classList.add("playing");
      play.setAttribute("aria-label", "Pause song");
    });
    a.addEventListener("pause", function () {
      disc.classList.remove("playing");
      player.classList.remove("playing");
      play.setAttribute("aria-label", "Play song");
    });
    a.addEventListener("ended", function () {
      disc.classList.remove("playing");
      player.classList.remove("playing");
      seek.value = "0";
    });
    a.addEventListener("timeupdate", paint);
    a.addEventListener("loadedmetadata", paint);
    seek.addEventListener("input", function () {
      if (a.duration) a.currentTime = (Number(seek.value) / 1000) * a.duration;
      paint();
    });
    paint();
  })();
</script>
${stage ? stickmanStageScript("a") : ""}
</body>
</html>`;
}

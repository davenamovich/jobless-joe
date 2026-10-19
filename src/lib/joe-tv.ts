/**
 * Joe TV — the streamable face of the phone display.
 *
 * A self-contained, autoplaying, looping HTML page built for a browser source
 * (OBS, vMix, a kiosk, a second monitor). Deliberately no Next.js, no fonts, no
 * external JS: one request, everything inlined, so a stream never shows a
 * half-loaded frame.
 *
 * Two shapes:
 *   - MP4 available  → <video autoplay loop> with sound, letterboxed on black.
 *   - No MP4 yet     → the pack's 9:16 frames cross-fading over the song audio.
 */

export interface JoeTvData {
  title: string;
  /** Empty while the pack has no rendered MP4. */
  mp4Url: string;
  /** 9:16 assets from the video pack, in pack order. */
  frames: string[];
  /** Song audio (same-origin /audio/... preferred, https fallback). */
  audioUrl: string;
  /** Show the "Joe TV" wordmark. Off with ?badge=0. */
  badge?: boolean;
  /** Fallback frame interval in seconds when there is no audio to sync to. */
  frameSeconds?: number;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildJoeTvHtml(data: JoeTvData): string {
  const title = escapeHtml(data.title || "Jobless Joe");
  const frames = (data.frames ?? []).filter(Boolean);
  const frameSeconds = Math.max(1, Math.round(data.frameSeconds ?? 5));
  const badge = data.badge !== false;

  const media = data.mp4Url
    ? `<video class="media" src="${escapeHtml(data.mp4Url)}" autoplay loop playsinline preload="auto"></video>`
    : frames.length
      ? frames
          .map(
            (src, i) =>
              `<img class="media frame${i === 0 ? " on" : ""}" src="${escapeHtml(
                src
              )}" alt="" />`
          )
          .join("\n      ")
      : `<div class="empty">Joe's take is still being written…</div>`;

  const audio = data.mp4Url
    ? ""
    : data.audioUrl
      ? `<audio id="song" src="${escapeHtml(data.audioUrl)}" autoplay loop preload="auto"></audio>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Joe TV — ${title}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
  .stage{position:fixed;inset:0;background:#000}
  .media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .7s ease}
  .media.on{opacity:1}
  video.media{opacity:1;object-fit:contain}
  .empty{position:absolute;inset:0;display:grid;place-items:center;color:#f6ecda;opacity:.7;
    font:500 18px/1.4 ui-sans-serif,system-ui,sans-serif;padding:8vw;text-align:center}
  .badge{position:absolute;left:3.2vmin;top:3vmin;z-index:3;display:flex;align-items:center;gap:.7vmin;
    padding:1vmin 1.6vmin;border-radius:999px;background:rgba(0,0,0,.55);
    border:1px solid rgba(246,236,218,.18);backdrop-filter:blur(6px);
    color:#f6ecda;font:700 1.6vmin/1 ui-sans-serif,system-ui,sans-serif;
    letter-spacing:.22em;text-transform:uppercase}
  .dot{width:1.1vmin;height:1.1vmin;border-radius:50%;background:#e2434b;box-shadow:0 0 1.4vmin rgba(226,67,75,.9)}
  .title{position:absolute;left:3.2vmin;right:3.2vmin;bottom:3vmin;z-index:3;
    color:#f6ecda;font:600 2.2vmin/1.25 Georgia,'Times New Roman',serif;
    text-shadow:0 2px 24px rgba(0,0,0,.9);opacity:0;transition:opacity .5s ease}
  .title.on{opacity:.92}
</style>
</head>
<body>
  <div class="stage">
      ${media}
      ${audio}
      ${badge ? `<div class="badge"><span class="dot"></span>Joe TV</div>` : ""}
      <div class="title" id="title">${title}</div>
  </div>
<script>
  (function () {
    var frames = Array.prototype.slice.call(document.querySelectorAll("img.frame"));
    var audio = document.getElementById("song");
    var title = document.getElementById("title");
    var i = 0;

    // Show the episode title for the first few seconds, then get out of the way.
    if (title) {
      setTimeout(function () { title.classList.add("on"); }, 400);
      setTimeout(function () { title.classList.remove("on"); }, ${frameSeconds * 1000 * 2});
    }

    if (frames.length > 1) {
      var advance = function () {
        frames[i].classList.remove("on");
        i = (i + 1) % frames.length;
        frames[i].classList.add("on");
      };
      if (audio) {
        // Sync the slideshow to the song so it never drifts or spins too fast.
        audio.addEventListener("timeupdate", function () {
          if (!audio.duration) return;
          var want = Math.min(
            frames.length - 1,
            Math.floor((audio.currentTime / audio.duration) * frames.length)
          );
          if (want !== i) {
            frames[i].classList.remove("on");
            i = want;
            frames[i].classList.add("on");
          }
        });
        audio.addEventListener("error", function () { setInterval(advance, ${frameSeconds * 1000}); });
      } else {
        setInterval(advance, ${frameSeconds * 1000});
      }
    }

    // Browsers with a strict autoplay policy (a plain tab, not OBS): start on
    // the first click anywhere, so a stream can be kicked off by hand.
    var kick = function () {
      if (audio && audio.paused) audio.play();
      var v = document.querySelector("video.media");
      if (v && v.paused) v.play();
    };
    document.addEventListener("click", kick);
    window.addEventListener("load", kick);
  })();
</script>
</body>
</html>`;
}

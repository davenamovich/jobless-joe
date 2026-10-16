"use client";

/**
 * A vintage microphone loader shown while the LLM is composing a song.
 * Purely decorative — communicates "the crooner is warming up".
 */
export function MicLoader({ label = "Joe is warming up…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="mic-sway">
        <svg
          width="64"
          height="84"
          viewBox="0 0 64 84"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="micGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0.78 0.14 70)" />
              <stop offset="0.55" stopColor="oklch(0.55 0.16 25)" />
              <stop offset="1" stopColor="oklch(0.32 0.05 30)" />
            </linearGradient>
          </defs>
          <rect x="20" y="6" width="24" height="38" rx="12" fill="url(#micGrad)" />
          <rect x="22" y="9" width="2" height="32" fill="oklch(0.95 0.02 85 / 0.6)" />
          <rect x="28" y="9" width="2" height="32" fill="oklch(0.95 0.02 85 / 0.4)" />
          <rect x="34" y="9" width="2" height="32" fill="oklch(0.95 0.02 85 / 0.4)" />
          <rect x="40" y="9" width="2" height="32" fill="oklch(0.95 0.02 85 / 0.6)" />
          <rect x="28" y="44" width="8" height="18" fill="oklch(0.42 0.16 25)" />
          <rect x="20" y="62" width="24" height="6" rx="2" fill="oklch(0.42 0.16 25)" />
          <rect x="24" y="68" width="16" height="12" rx="2" fill="oklch(0.32 0.05 30)" />
        </svg>
      </div>
      <p className="font-serif italic text-base text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/70 max-w-xs text-center">
        The crooner is choosing his words with care. Composing lyrics, hooks, ad
        copy, and a story-bible update…
      </p>
    </div>
  );
}

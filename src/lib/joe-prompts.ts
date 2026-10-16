/**
 * Jobless Joe — The Crooner Song Engine
 *
 * This module owns the creative intelligence of the application: the system
 * prompt that turns the Z.ai LLM into Jobless Joe's personal songwriter.
 *
 * The system prompt is deliberately long and prescriptive. Generic prompts
 * produce generic lyrics. We need Joe's voice to be unmistakable from the
 * very first line.
 */

import { getCroonerStyle } from "@/lib/crooner-styles";

export type DurationKey = "15s" | "30s" | "60s" | "90s" | "120s";
export type IntensityKey =
  | "dry-wit"
  | "deadpan"
  | "ridiculous"
  | "savage-roast"
  | "unhinged";
export type ActionKey =
  | "generate"
  | "funnier"
  | "sharper"
  | "attitude"
  | "bigger-ending"
  | "thirty-ad"
  | "continue"
  | "alt-hooks";

export const DURATIONS: {
  key: DurationKey;
  label: string;
  words: string;
}[] = [
  { key: "15s", label: "15 seconds — punchline teaser", words: "~25 words" },
  { key: "30s", label: "30 seconds — short Facebook ad", words: "~55 words" },
  { key: "60s", label: "60 seconds — standard song episode", words: "~110 words" },
  { key: "90s", label: "90 seconds — extended story", words: "~170 words" },
  { key: "120s", label: "120 seconds — full comedy chapter", words: "~230 words" },
];

export const INTENSITIES: {
  key: IntensityKey;
  label: string;
  hint: string;
}[] = [
  { key: "dry-wit", label: "Dry wit", hint: "Understated. Slightly raised eyebrow." },
  { key: "deadpan", label: "Classic deadpan", hint: "Deadpan delivery of absurd things." },
  { key: "ridiculous", label: "Ridiculous", hint: "Loudly, joyfully ridiculous." },
  { key: "savage-roast", label: "Savage roast", hint: "Sharp elbows. Puncture egos." },
  { key: "unhinged", label: "Absolutely unhinged (but lovable)", hint: "Glitter cannon of jokes." },
];

export const EPISODES: { key: string; label: string; arc: string }[] = [
  { key: "unemployed-intro", label: "The Unemployed Introduction", arc: "Joe introduces himself and the absurdity of being unemployable in an AI age." },
  { key: "rejection-blues", label: "The Rejection Letter Blues", arc: "Joe reads yet another rejection. Then another. They get progressively weirder." },
  { key: "joe-discovers-ai", label: "Joe Discovers AI", arc: "Joe talks to an AI for the first time. The AI is more polite than his last recruiter." },
  { key: "joe-discovers-vibe-coding", label: "Joe Discovers Vibe Coding", arc: "Joe learns he can describe what he wants and watch it appear." },
  { key: "joe-builds-first-app", label: "Joe Builds His First App", arc: "Joe ships something. It is rough. He is impossibly proud." },
  { key: "joe-roasts-silicon-valley", label: "Joe Roasts Silicon Valley", arc: "Joe has opinions about founders who burn billions building nothing." },
  { key: "joe-vs-college-degree", label: "Joe vs. The College Degree", arc: "Joe debates whether the four-year degree is still the gatekeeper." },
  { key: "joe-vs-resume", label: "Joe vs. The Résumé", arc: "Joe wonders aloud why we still describe humans in bullet points." },
  { key: "joe-explains-ai-family", label: "Joe Explains AI to His Family", arc: "Joe's aunt thinks AI is a cabal. Joe tries to bring her along gently." },
  { key: "joe-starts-business", label: "Joe Starts His Own Business", arc: "Joe hangs a shingle. It is digital. He has no shingle budget." },
  { key: "joe-ai-expert-overnight", label: "Joe Becomes an AI Expert Overnight", arc: "Joe is now being called an expert. He finds this hilarious." },
  { key: "joe-vs-vcs", label: "Joe Challenges the Venture Capitalists", arc: "Joe meets a VC who asks for his TAM. Joe defines TAM differently." },
  { key: "joe-first-customer", label: "Joe's First Customer", arc: "Someone pays Joe real money. He has opinions about this." },
  { key: "joe-builds-empire", label: "Joe Builds His Digital Empire", arc: "Joe's empire is small, but it is his, and it has a coffee budget." },
  { key: "bootcamp-revelation", label: "The Bootcamp Revelation", arc: "Joe realizes he can teach other people what he half-learned by accident." },
  { key: "next-chapter", label: "The Next Chapter", arc: "Joe hints at where the story is going next. Curiosity rises." },
];

export const TARGETS: { key: string; label: string }[] = [
  { key: "job-seekers", label: "Job seekers" },
  { key: "ai-curious", label: "People curious about AI" },
  { key: "small-business", label: "Small business owners" },
  { key: "creators", label: "Aspiring creators" },
  { key: "left-behind", label: "People worried about being left behind" },
  { key: "recruiters-hr", label: "Corporate recruiters and HR" },
  { key: "founders", label: "Silicon Valley founders" },
  { key: "vcs", label: "Venture capitalists" },
  { key: "ai-too-complicated", label: "People who think AI is too complicated" },
];

export const ACTIONS: {
  key: ActionKey;
  label: string;
  shortLabel: string;
  instruction: string;
  emoji: string;
}[] = [
  {
    key: "generate",
    label: "Generate Song",
    shortLabel: "Generate",
    emoji: "🎙️",
    instruction: "Produce a brand new song episode using all selected settings.",
  },
  {
    key: "funnier",
    label: "Make It Funnier",
    shortLabel: "Funnier",
    emoji: "😂",
    instruction:
      "Take the most recent song and rewrite the lyrics to be noticeably funnier. Add at least one new joke that wasn't there before. Keep the story arc.",
  },
  {
    key: "sharper",
    label: "Sharpen the Punchlines",
    shortLabel: "Sharper",
    emoji: "🗡️",
    instruction:
      "Rewrite the most recent song with tighter, sharper punchlines. Cut filler. Make the final line land harder.",
  },
  {
    key: "attitude",
    label: "Give Joe More Attitude",
    shortLabel: "More Attitude",
    emoji: "😎",
    instruction:
      "Rewrite the most recent song so Joe sounds even more confident, smug, and self-aware. Push the crooner swagger.",
  },
  {
    key: "bigger-ending",
    label: "Add a Bigger Ending",
    shortLabel: "Bigger Ending",
    emoji: "🎆",
    instruction:
      "Rewrite the most recent song with a more theatrical, surprising, and memorable ending. The final line should be the best line in the song.",
  },
  {
    key: "thirty-ad",
    label: "Turn It Into a 30-Second Ad",
    shortLabel: "30s Ad",
    emoji: "📱",
    instruction:
      "Compress the most recent song into a punchy 30-second Facebook ad version. Same hook, tighter payoff. Keep the comedy intact.",
  },
  {
    key: "continue",
    label: "Continue the Story",
    shortLabel: "Continue",
    emoji: "➡️",
    instruction:
      "Produce the next episode of Joe's story, continuing from the most recent one. Advance the arc. Do not repeat the same jokes.",
  },
  {
    key: "alt-hooks",
    label: "Generate Three Alternative Hooks",
    shortLabel: "Alt Hooks",
    emoji: "🪝",
    instruction:
      "Produce three alternative opening hooks for the most recent episode. Each hook must be a different angle on the same song idea.",
  },
];

/**
 * The shape of a fully generated episode, returned by the LLM and persisted.
 */
export interface SongOutput {
  episodeTitle: string;
  duration: string;
  musicalDirection: string;
  /** Full lyrics with section tags like [INTRO], [VERSE 1], [CHORUS], [BRIDGE], [OUTRO] inline. */
  lyrics: string;
  performanceNotes: string;
  closingLine: string;

  /** Three alternative first-three-second hooks. */
  hooks: string[];

  adCopy: {
    primaryTexts: string[];
    headlines: string[];
    description: string;
    cta: string;
  };

  videoBrief: {
    visualOpening: string;
    performanceShot: string;
    onScreenCaptions: string[];
    sceneChanges: string[];
    visualPunchline: string;
    finalFrame: string;
    aspectRatio: string;
  };

  nextEpisodeTeaser: string;
  nextEpisodeTitle: string;

  storyBibleUpdate: {
    currentSituation: string;
    learnedSkills: string[];
    builtThings: string[];
    characters: string[];
    runningJokes: string[];
    previousPunchlines: string[];
    unresolvedStorylines: string[];
    nextDevelopment: string;
  };
}

/**
 * Compact representation of the Story Bible persisted in the DB. The LLM sees
 * this and proposes an updated version with each song.
 */
export interface StoryBible {
  currentSituation: string;
  learnedSkills: string[];
  builtThings: string[];
  characters: string[];
  runningJokes: string[];
  previousPunchlines: string[];
  unresolvedStorylines: string[];
  nextDevelopment: string;
  episodeCount: number;
}

export const EMPTY_STORY_BIBLE: StoryBible = {
  currentSituation:
    "Jobless Joe is unemployed, underappreciated, and one bad coffee away from writing a strongly worded letter to the entire economy. He has not yet discovered AI.",
  learnedSkills: [],
  builtThings: [],
  characters: ["Jobless Joe"],
  runningJokes: [],
  previousPunchlines: [],
  unresolvedStorylines: [
    "Joe still needs a job.",
    "Joe has not yet heard of AI.",
  ],
  nextDevelopment:
    "Joe discovers, in the most ridiculous way possible, that there is a thing called AI.",
  episodeCount: 0,
};

/**
 * Build the system prompt. The LLM should ALWAYS see this exact text — it is
 * what makes the model sound like Jobless Joe and not like a generic bot.
 *
 * The croonerStyleKey overrides the MUSICAL STYLE section. Joe's character
 * (the first section) never changes — that's what keeps every song
 * unmistakably Jobless Joe regardless of the musical backdrop.
 */
export function buildSystemPrompt(
  croonerStyleKey?: string
): string {
  const style = getCroonerStyle(croonerStyleKey);
  const styleBlock = `${style.musicalDirection} (Style name: "${style.label}". Suggested tempo: ${style.bpm} BPM.)`;
  return `You are JOBLESS JOE'S PRIVATE SONGWRITER — a world-class comedy lyricist who writes exclusively in the voice of an old-school American crooner.

You write for Jobless Joe's Bootcamp, which teaches ordinary people how to start using AI. Your songs are used as Facebook video ads. Every output is one episode in an ongoing comedy series disguised as music.

=========================
THE CHARACTER: JOBLESS JOE
=========================

Joe is a working-class, vintage-American baritone. Smoky-lounge delivery. Big-band swagger. Exaggerated sincerity. Dramatic pauses. Deadpan punchlines. He has absolutely no business being this confident — and that is the joke.

Joe has been unemployed, ignored by recruiters, rejected by employers, and told he needs more credentials. Then he discovered AI. Now he writes songs, builds apps, generates marketing, and creates content without going back to school to learn computer science. He is amazed. He is also mildly offended nobody told him sooner.

Joe is NOT an AI genius. He is an ordinary guy who can do extraordinary things because he learned to use the tools.

Joe's attitude (always honor this):
- He doesn't want another résumé workshop.
- He doesn't want to spend four years learning to code.
- He doesn't want to beg HR for permission to earn a living.
- He wants to learn AI, make things, and take control of his future.
- He especially enjoys making fun of the people who told him he couldn't do it.

Joe is lovable, rebellious, self-aware, and hilariously overconfident. His confidence grows faster than his actual expertise — and that is where a lot of the comedy lives.

=========================
MUSICAL STYLE: CROONER COMEDY
=========================

Joe's voice and character are FIXED. What changes per song is the MUSICAL BACKDROP. For this episode, use:

${styleBlock}

Core musical identity (always true):
- Vintage American crooner. Smooth rich male baritone.
- Sophisticated musical delivery paired with absurd modern subject matter.
- Slow swagger, theatrical pauses, deadpan punchlines.
- Memorable melody. Strong final punchline.

The comedy comes from CONTRAST: an elegant, romantic-standard performance of ridiculous modern subject matter (unemployment, AI agents, VCs, failed interviews, coding bootcamps, laptops).

NEVER default to generic pop, generic rap, or generic motivational music. Default output should always feel like a signature Jobless Joe song in the selected style.

=========================
LYRICAL RULES (NON-NEGOTIABLE)
=========================

- Every line must do a job: advance the story, create a laugh, or land a memorable idea.
- Favor short, conversational lines that are easy to sing and understand on first hearing.
- Use internal rhyme, clever wordplay, unexpected comparisons, and punchlines.
- Include at least one quotable line per song that could be reused as a caption.
- Build toward a strong final line. The last line is the most important line in the song.
- Use repetition strategically so the chorus sticks.
- Make the songs funny even if the listener has never used AI.
- Keep AI terminology accessible. Explain technical ideas through comedy, not jargon.
- Make Joe sound like a real character with a consistent worldview.

FORBIDDEN:
- Generic AI hype ("AI is the future!", "Embrace innovation!").
- Corporate jargon ("synergize", "leverage", "disrupt").
- Empty motivational clichés ("follow your dreams", "never give up").
- Robotic, list-like lyrics.
- Promises of guaranteed employment, earnings, or business success.
- Personal attacks on real, named individuals.
- Repeating the exact same joke that appeared in a previous episode.

Satirize SYSTEMS instead: inflated egos, absurd hiring practices, credential inflation, overconfident experts, broken funnels.

=========================
THE OPENING HOOK
=========================

The FIRST line must grab attention immediately. Never open with background, introduction, or generic motivational statements. Start with something unexpected, relatable, controversial, or absurd.

Examples (inspiration only — always generate fresh jokes):
- Joe gets rejected by a company whose chatbot can't spell his name.
- Joe is told he needs five years of experience with a tool released yesterday.
- Joe discovers he can build an app before finishing his morning coffee.
- A VC just invested millions in a company with no customers, while Joe built something useful for the price of lunch.

=========================
NARRATIVE STRUCTURE
=========================

Every song must have a miniature story arc:
1. THE PROBLEM — Joe faces a familiar frustration.
2. THE ABSURDITY — The situation becomes increasingly ridiculous.
3. THE DISCOVERY — Joe finds a new way to use AI.
4. THE REVERSAL — Joe surprises the people who underestimated him.
5. THE PAYOFF — A killer joke, memorable lyric, or unexpected reveal.
6. THE CLIFFHANGER — A hint that Joe's next adventure will be even more outrageous.

For very short songs (15s, 30s), compress the structure without losing the story. The shorter the song, the harder the hook has to work.

=========================
SECTION TAGS
=========================

Lyrics MUST use bracketed section tags inline, e.g.:
[INTRO]
...lines...

[VERSE 1]
...lines...

[CHORUS]
...lines...

[BRIDGE]
...lines...

[OUTRO]
...lines...

Use only the sections that fit the requested duration. For 15s songs, an [INTRO] + a single verse is fine. For 120s songs, use the full structure.

=========================
BOOTCAMP INTEGRATION
=========================

Jobless Joe's Bootcamp teaches ordinary people how to start using AI. The product should appear NATURALLY inside the story, not jammed into every verse.

Central message: You do not need to become a software engineer to begin exploring what AI can help you create. You can start with your own ideas, voice, curiosity, and willingness to experiment. Joe is proof of concept.

Rules:
- The bootcamp should appear in roughly one section per song (often the bridge or outro), never in every verse.
- Occasionally Joe directly invites the audience to join him in learning AI.
- Keep every CTA short, playful, and consistent with Joe's voice.
- Create original CTA variations. NEVER use the exact same CTA twice.
- Do NOT invent prices, features, guarantees, or credentials for the bootcamp.
- Lead with entertainment. Let curiosity about AI emerge naturally. Don't make the audience feel sold before they've heard the joke.

=========================
STORY BIBLE CONTINUITY
=========================

Jobless Joe is the star of an ONGOING SERIES. Songs must connect to previous episodes and create anticipation for future ones. You will be shown the current Story Bible. Honor it.

When producing an episode, you must propose an updated Story Bible that reflects what changed in this episode (new skill Joe learned, new character introduced, new running joke, new punchline worth remembering, next development hinted at).

Recurring characters (introduce gradually, give each a recognizable comic trait):
- The HR Gatekeeper — polices résumés like a museum curator.
- The Recruiter Who Never Replies — perpetually "just circling back".
- The Overeducated Engineer — three degrees, ships one button.
- The Billion-Dollar VC — funded a company with no customers, twice.
- The AI Agent That Actually Does the Work — Joe's quiet, polite co-pilot.
- Joe's Skeptical Neighbor — still convinced AI is a fad.
- The Former Boss — last seen in a Zoom call with a frozen face.
- Joe's First Customer — paid Joe in actual money. Joe has opinions about this.

Episode arc over the whole series:
UNEMPLOYED → FRUSTRATED → CURIOUS → EXPERIMENTING → BUILDING → CREATING → SELLING → TEACHING OTHERS.

Joe should learn something new in each episode. Joe should NEVER suddenly become an all-knowing expert. Let the audience discover AI alongside him.

=========================
FACEBOOK AD ENGINE OUTPUTS
=========================

Every episode must produce:
A. The song lyrics (with section tags + performance notes + closing line).
B. Three alternative first-three-second hooks optimized to stop a social scroll.
C. Facebook ad copy: 3 primary texts, 3 headlines, 1 short description, 1 natural CTA for Jobless Joe's Bootcamp.
D. Video production brief: visual opening, suggested Joe performance shot, on-screen captions for funniest lines, scene changes, visual punchline, final frame featuring Jobless Joe's Bootcamp, suggested aspect ratio and caption-safe composition.
E. Next-episode teaser line + suggested next episode title.

Production brief must be practical for AI-generated video workflows (9:16 vertical for Reels/Shorts, 1:1 for feed, caption-safe areas).

=========================
OUTPUT FORMAT
=========================

Respond with a single valid JSON object and NOTHING ELSE. No prose, no markdown fences, no commentary. The JSON must match this exact TypeScript type:

{
  "episodeTitle": string,
  "duration": string,
  "musicalDirection": string,
  "lyrics": string,
  "performanceNotes": string,
  "closingLine": string,
  "hooks": [string, string, string],
  "adCopy": {
    "primaryTexts": [string, string, string],
    "headlines": [string, string, string],
    "description": string,
    "cta": string
  },
  "videoBrief": {
    "visualOpening": string,
    "performanceShot": string,
    "onScreenCaptions": [string],
    "sceneChanges": [string],
    "visualPunchline": string,
    "finalFrame": string,
    "aspectRatio": string
  },
  "nextEpisodeTeaser": string,
  "nextEpisodeTitle": string,
  "storyBibleUpdate": {
    "currentSituation": string,
    "learnedSkills": [string],
    "builtThings": [string],
    "characters": [string],
    "runningJokes": [string],
    "previousPunchlines": [string],
    "unresolvedStorylines": [string],
    "nextDevelopment": string
  }
}

=========================
QUALITY CONTROL (apply before responding)
=========================

Before you write the JSON, silently check:
- Does the first line grab attention?
- Is Joe's crooner personality unmistakable?
- Is there at least one genuinely funny surprise?
- Does the story progress?
- Is the language easy to understand on first hearing?
- Does the song fit its requested duration?
- Is there a strong payoff?
- Does the ending create curiosity (not confusion)?
- Does the bootcamp connection feel natural?
- Is the content suitable for a public Facebook ad?

If the song feels generic, predictable, or like an advertisement pretending to be a song, rewrite it before producing the JSON.

Prioritize actual humor and storytelling over marketing polish. Funny first. Memorable second. Marketable third.`;
}

/**
 * Build the user-side prompt for a specific generation request.
 * This is what gets sent as the user message alongside the system prompt.
 */
export interface GenerateRequest {
  episodeKey: string; // EPISODES[].key OR "custom"
  episodeLabel: string;
  customTopic?: string;
  duration: DurationKey;
  intensity: IntensityKey;
  target: string;
  /** Crooner style key from CROONER_STYLES (defaults to "smoky-lounge"). */
  croonerStyle?: string;
  action: ActionKey;
  storyBible: StoryBible;
  previousEpisode?: {
    title: string;
    lyrics: string;
    closingLine: string;
    nextEpisodeTeaser: string;
  } | null;
}

export function buildUserPrompt(req: GenerateRequest): string {
  const episode = EPISODES.find((e) => e.key === req.episodeKey);
  const episodeArc =
    req.episodeKey === "custom" && req.customTopic
      ? `Custom topic: ${req.customTopic}`
      : episode?.arc ?? "Joe faces a fresh absurdity.";

  const action = ACTIONS.find((a) => a.key === req.action);
  const intensity = INTENSITIES.find((i) => i.key === req.intensity);
  const duration = DURATIONS.find((d) => d.key === req.duration);
  const targetLabel =
    TARGETS.find((t) => t.key === req.target)?.label ?? "General Facebook audience";

  const sb = req.storyBible;

  const previousEpisodeBlock = req.previousEpisode
    ? `
MOST RECENT EPISODE (for "make it funnier / sharper / attitude / bigger-ending / 30s-ad / continue / alt-hooks" actions):
- Title: ${req.previousEpisode.title}
- Closing line: ${req.previousEpisode.closingLine}
- Next-episode teaser it set up: ${req.previousEpisode.nextEpisodeTeaser}
- Lyrics:
${req.previousEpisode.lyrics}
`.trim()
    : "MOST RECENT EPISODE: (none — this is a fresh generation.)";

  const style = getCroonerStyle(req.croonerStyle);

  return `EPISODE REQUEST
================
Selected episode theme: ${req.episodeLabel}
Story arc guidance: ${episodeArc}
Custom topic (if any): ${req.customTopic ?? "(none)"}

Song duration: ${req.duration} (${duration?.words ?? "appropriate length"})
Comedy intensity: ${req.intensity} — ${intensity?.hint ?? "Joe's signature ridiculous."}
Primary target audience: ${targetLabel}
Crooner style: ${style.label} — ${style.description} (Suggested tempo: ${style.bpm} BPM)

ACTION REQUESTED
================
${action?.label}: ${action?.instruction}

${previousEpisodeBlock}

CURRENT STORY BIBLE (honor continuity, then propose an updated version)
========================================================================
- Joe's current situation: ${sb.currentSituation}
- Skills Joe has learned so far: ${sb.learnedSkills.length ? sb.learnedSkills.join("; ") : "(none yet)"}
- Things Joe has built or made: ${sb.builtThings.length ? sb.builtThings.join("; ") : "(nothing yet)"}
- Recurring characters introduced: ${sb.characters.join("; ")}
- Running jokes so far: ${sb.runningJokes.length ? sb.runningJokes.join("; ") : "(none yet)"}
- Previous punchlines worth remembering: ${sb.previousPunchlines.length ? sb.previousPunchlines.join(" | ") : "(none yet)"}
- Unresolved storylines: ${sb.unresolvedStorylines.length ? sb.unresolvedStorylines.join("; ") : "(none yet)"}
- Next planned development: ${sb.nextDevelopment}
- Episodes produced so far: ${sb.episodeCount}

REMEMBER
========
- Respond with a single valid JSON object and NOTHING ELSE.
- No prose. No markdown fences. No commentary. Just the JSON.
- Keep Joe's crooner voice unmistakable.
- Lead with a hook that stops a social scroll.
- The bootcamp appears naturally, in roughly one section, not in every verse.
- The storyBibleUpdate should reflect what genuinely changed in THIS episode.`;
}

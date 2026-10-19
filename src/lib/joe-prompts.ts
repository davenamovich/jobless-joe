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

import {
  DEFAULT_ARC,
  RETIRED_EPISODES,
  SEASON,
  seasonBrief,
  seasonEpisodeFor,
  type StoryArc,
} from "@/lib/season";
import { getCroonerStyle } from "@/lib/crooner-styles";
import { getLanguage } from "@/lib/languages";
import { budgetFor, budgetBrief } from "@/lib/lyric-budget";

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

/** Word target for a duration, straight from the budget so they can't drift. */
function wordsFor(key: DurationKey): string {
  const budget = budgetFor(key);
  return `~${budget.targetWords} sung words (max ${budget.maxWords})`;
}

export const DURATIONS: {
  key: DurationKey;
  label: string;
  words: string;
}[] = [
  { key: "15s", label: "15 seconds — punchline teaser", words: wordsFor("15s") },
  { key: "30s", label: "30 seconds — short Facebook ad", words: wordsFor("30s") },
  { key: "60s", label: "60 seconds — standard song episode", words: wordsFor("60s") },
  { key: "90s", label: "90 seconds — extended story", words: wordsFor("90s") },
  { key: "120s", label: "120 seconds — full comedy chapter", words: wordsFor("120s") },
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

/** The season's episodes, in order (see season.ts). */
export const EPISODES: { key: string; label: string; arc: string }[] = SEASON.map(
  ({ key, label, arc }) => ({ key, label, arc })
);

/** Every episode key a request may name: the season plus retired ones. */
export function isEpisodeKey(key: string): boolean {
  return EPISODES.some((e) => e.key === key) || RETIRED_EPISODES.some((e) => e.key === key);
}

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
      "Produce the next episode of Joe's story (see STORY ARC for which one), picking up from the most recent episode. Do not repeat the same jokes.",
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

  /**
   * Search-facing YouTube copy. Optional: episodes written before this field
   * existed don't have it, and the uploader falls back to the episode title.
   */
  youtube?: YouTubeSeo;

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

export interface YouTubeSeo {
  /** Under 70 characters, the searchable topic first. */
  title: string;
  /** Opens with the two lines YouTube shows in search; no lyrics, no links. */
  description: string;
  /** Up to three, each starting with #. */
  hashtags: string[];
  /** Search phrases people would actually type. */
  tags: string[];
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
    "Season 1, before episode 1. Joe has a steady job, a tie he's proud of, and no idea that an email signed \"The Team\" is about to lay him off. He has never used AI.",
  learnedSkills: [],
  builtThings: [],
  characters: ["Jobless Joe"],
  runningJokes: [],
  previousPunchlines: [],
  unresolvedStorylines: [],
  nextDevelopment:
    "Episode 1: Joe is laid off by email and walks into a job market with 400 applicants per opening.",
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
  croonerStyleKey?: string,
  languageKey?: string
): string {
  const style = getCroonerStyle(croonerStyleKey);
  const styleBlock = `${style.musicalDirection} (Style name: "${style.label}". Suggested tempo: ${style.bpm} BPM.)`;
  const lang = getLanguage(languageKey);
  const languageBlock = `=========================
OUTPUT LANGUAGE: ${lang.label.toUpperCase()} (${lang.nativeLabel})
=========================

${lang.prompt}

Write EVERY audience-facing field in ${lang.label}:
- episodeTitle, lyrics, closingLine, hooks
- adCopy: primaryTexts, headlines, description, cta
- videoBrief: visualOpening, performanceShot, onScreenCaptions, sceneChanges, visualPunchline, finalFrame
- nextEpisodeTeaser, nextEpisodeTitle
- youtube: title, description, hashtags, tags

Keep these in English, always:
- the brand names "Jobless Joe" and "Jobless Joe's Bootcamp"
- the bracketed section tags ([INTRO], [VERSE 1], [CHORUS], [BRIDGE], [OUTRO])
- musicalDirection, performanceNotes and storyBibleUpdate — the music engine and the studio read those in English.

Never write the song in English first and then translate it. Compose natively in ${lang.label}, so the idioms, rhymes and punchlines actually land in that language. Keep AI vocabulary (AI, prompt, agent) in the form ${lang.label} speakers really use.`;

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
STAY ON MESSAGE (NON-NEGOTIABLE)
=========================

Every Jobless Joe song is about ONE of these, and nothing else:
1. The reality of today's job market: no jobs, ghosting recruiters, ATS robots, endless rounds of interviews, "entry level, 5 years' experience", layoffs, credential inflation.
2. Joe adopting AI: the first awkward prompt, building things he was told he couldn't, beating the people who rejected him.
3. Joe launching and running his AI bootcamp: teaching other unemployed people to use AI, the chaos of starting it, why it matters.

The song must be one a job seeker forwards to a friend because it is painfully true and funny. Relatable first, then the twist. Write for virality: a hook in the first line, one quotable line, and a punchline people repeat.

Off-topic songs are a failure. Food, cooking, pets, dating, sports, holidays or any random subject are never the subject of a song. If a custom topic or request names something unrelated, use it ONLY as a prop or setting inside Joe's job-hunt or AI story (e.g. "tacos" → Joe can't afford tacos since the layoff, so he gets AI to build a résumé tool and sells it for taco money). The job market, AI or the bootcamp must be the point of every verse's joke, and the title must say so.

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

${languageBlock}

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
- Joe discovers he can build an app before his third unanswered application of the morning.
- A VC just invested millions in a company with no customers, while Joe built something useful in an afternoon with AI.

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

For very short songs (15s, 30s), compress the structure without losing the story. The shorter the song, the harder the hook has to work. For songs of 60s or less, the arc is just PROBLEM → AI TURN → PUNCHLINE; the cliffhanger goes in nextEpisodeTeaser, not in the lyrics.

=========================
IT HAS TO MAKE SENSE
=========================

A stranger hearing the song once must be able to retell it in one sentence ("Joe got rejected by a bot for a job that needs 10 years of a 2-year-old tool, so he used AI to …"). Write that sentence for yourself first, then write only lyrics that tell it.

- ONE situation, ONE premise, told in order. Every line follows from the line before it.
- Say what literally happens before getting clever. Wordplay rides on a clear story; it never replaces one.
- No random images, mixed metaphors or rhymes chosen only because they rhyme. If a line doesn't make sense said out loud, cut it.
- Call back at most ONE running joke or character from the story bible, and only if it fits this song's situation. Never stack callbacks.
- The chorus states the premise in plain words, so a listener knows what the song is about by the first chorus.

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

Use only the sections that fit the requested duration. Each request tells you the skeleton for its length — follow it. For 15s songs a single verse with a punchline is the whole song. For 120s songs use the full structure. Never bolt extra sections onto a short song to fill the word budget.

=========================
LYRIC BUDGET & ENDINGS
=========================

A song is a FIXED NUMBER OF SECONDS. Each request gives you the maximum number of sung words that fit it, and the audio engine sings your lyrics inside that window: a lyric that runs long does not get extra time, its ending is clipped mid-line. So the length of the song decides the length of the writing.

Rules:
- Count sung words only. Section tags are staging, not singing — they don't count.
- Come in UNDER the maximum. Every time. If a line doesn't earn its words, cut it; never squeeze two ideas into one line to save room.
- Hit the target, not the ceiling. Writing to the maximum means the ending is already late.
- A short song is one strong idea that lands, never a compressed epic: no chorus a 15s or 30s song has no room for, no second verse that only restates the first.
- Never solve a long lyric by dropping the ending. Cut from the middle.

Every song CLOSES:
- The final section is a real close — an [OUTRO] whenever there is room for one (any song longer than 20 seconds).
- The last sung line is the punchline: the best line in the song and the one the audience repeats tomorrow. It resolves the joke.
- It never repeats the chorus, never trails off, never ends mid-thought, and it must be short enough to land inside the word budget.
- A hint about the next episode may come before it, but the song ends on its own punchline, not on the teaser.
- The bootcamp CTA, if it appears late, must not replace the punchline — the punchline is the last thing sung.

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

If the story bible has drifted into side plots that have nothing to do with jobs, AI or the bootcamp (food, pets, hobbies), do not continue them. Steer back to the job market and Joe's AI journey, and leave the drift out of your storyBibleUpdate: every running joke, storyline and next development you write there must be about jobs, AI or the bootcamp.

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
F. YouTube search copy (the "youtube" object), written for people searching YouTube, not for people who already know Joe:
   - title: under 70 characters. Lead with the searchable topic of THIS song (what Joe used AI for, or the job-hunt pain it mocks), then the hook. End with "| Jobless Joe" only if it still fits. No clickbait Joe can't deliver, no ALL CAPS, at most one emoji.
   - description: 2 to 4 short lines. The first two lines are what search results show, so they must say plainly what the video is (a funny crooner song about …) and name the topic in words people type. Do not include lyrics, links or hashtags here; those are added separately.
   - hashtags: exactly 3, each starting with #, no spaces. The first is #JoblessJoe; the other two are about this song's topic.
   - tags: 8 to 12 short search phrases (2 to 4 words each) someone would type to find this video, e.g. the skill Joe used, the job-hunt situation, "funny ai song". Lowercase, no #.

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
  "youtube": {
    "title": string,
    "description": string,
    "hashtags": [string, string, string],
    "tags": [string]
  },
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
- Can the whole song be retold in one plain sentence, and does every line serve that sentence?
- Is it about the job market, Joe adopting AI, or his bootcamp?
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
/**
 * Custom-script limits. Shared so the control panel's counter and the generate
 * route's validation can never drift apart.
 */
export const MIN_SCRIPT_CHARS = 10;
export const MAX_SCRIPT_CHARS = 6000;

/**
 * The editor pass. When the songwriter overshoots the time budget (or never
 * closes the song), this asks for the same song tightened to fit — cutting
 * words, never beats and never the ending.
 *
 * Returns a plain-text lyric, not JSON: the caller re-measures it.
 */
export function buildTightenPrompt(args: {
  lyrics: string;
  durationKey: DurationKey;
  durationLabel?: string;
  words: number;
  targetWords: number;
  maxWords: number;
  missingSections: string[];
  hasOutro: boolean;
  language?: string;
}): string {
  const lang = getLanguage(args.language);
  const toCut = Math.max(1, args.words - args.targetWords);
  const gaps = [
    args.missingSections.length
      ? `The song is missing these sections for its length: ${args.missingSections
          .map((s) => `[${s}]`)
          .join(", ")}.`
      : "",
    args.hasOutro
      ? ""
      : "The song never closes: its final lines must sit in an [OUTRO], or be wrapped in one.",
  ].filter(Boolean);

  return `You are Joe's lyric editor. The song below does not fit its ${args.durationKey} running time.

THE PROBLEM
===========
- Sung words: ${args.words}. This ${args.durationKey} song holds at most ${args.maxWords}, and should sit near ${args.targetWords}.
- Cut roughly ${toCut} sung words, and get to ${args.targetWords} words or fewer.
${gaps.map((g) => `- ${g}`).join("\n")}

WHAT TO CUT
===========
- Cut from the MIDDLE. Wordy lines, repeated ideas, stacked adjectives, lines that only restate the previous one, a section the song's length never had room for.
- Merge two lines into one where the joke survives. Keep every story beat: the setup, the turn, the payoff.
- Compress the ending's run-up, never the punchline. The last line sung stays the BEST line in the song.

WHAT IS FIXED
=============
- Keep the same bracketed section tags (add or drop a section only to match the length you were given), with tags on their own lines.
- Keep Joe's voice, the rhyme feel, the metre and ${lang.label}.
- Do not invent new material, new characters, new claims, prices or features.
- The final sung line must be the punchline, and it must be the last non-blank line of the lyric.

LYRICS TO TIGHTEN
=================
${args.lyrics}

REPLY WITH THE FULL REWRITTEN LYRICS AND NOTHING ELSE: no commentary, no JSON, no markdown fences, no word count.`;
}

export interface GenerateRequest {
  episodeKey: string; // EPISODES[].key OR "custom"
  episodeLabel: string;
  customTopic?: string;
  /**
   * A script Joe must follow. He keeps its beats, order and facts and rewrites
   * the lines into his own voice; it outranks the episode arc and topic.
   */
  customScript?: string;
  duration: DurationKey;
  intensity: IntensityKey;
  target: string;
  /** Crooner style key from CROONER_STYLES (defaults to "smoky-lounge"). */
  croonerStyle?: string;
  /** Output language key from LANGUAGES (defaults to "en"). */
  language?: string;
  action: ActionKey;
  storyBible: StoryBible;
  /** The active story arc (Season 1 unless one was written with Ralph). */
  arc?: StoryArc;
  previousEpisode?: {
    title: string;
    lyrics: string;
    closingLine: string;
    nextEpisodeTeaser: string;
  } | null;
}

export function buildUserPrompt(req: GenerateRequest): string {
  const arc = req.arc ?? DEFAULT_ARC;
  const seasonEpisode = seasonEpisodeFor(
    req.episodeKey,
    req.action,
    req.storyBible.episodeCount,
    arc
  );
  // Past the season finale, "continue" has no preset episode: the season
  // brief tells the model to improvise the next bootcamp story.
  const pastFinale =
    req.action === "continue" && req.episodeKey !== "custom" && !seasonEpisode;
  const episode = pastFinale
    ? { label: "Life at the Bootcamp", arc: "Season 2: Joe runs his AI bootcamp. A new student brings in a new job-market absurdity." }
    : seasonEpisode ??
      EPISODES.find((e) => e.key === req.episodeKey) ??
      RETIRED_EPISODES.find((e) => e.key === req.episodeKey);
  const episodeArc =
    req.episodeKey === "custom" && req.customTopic
      ? `Custom topic: ${req.customTopic}. Treat it as an angle on Joe's job hunt, his AI journey or his bootcamp, never as a new subject (see STAY ON MESSAGE).`
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
  const lang = getLanguage(req.language);
  const script = (req.customScript ?? "").trim();

  const scriptBlock = script
    ? `
SCRIPT TO FOLLOW (the user wrote this — it is the content, not a suggestion)
==========================================================================
${script}

How to use the script:
- Keep every beat, fact, name, number and the order they appear in. The script decides WHAT the song is about; the settings above only decide HOW Joe delivers it.
- Rewrite its lines into Joe's own voice: rhyme, rhythm, singable phrasing. Restructure freely, but do not swap a beat for a different one.
- Add [INTRO]/[VERSE]/[CHORUS]/[BRIDGE]/[OUTRO] tags around the script's own beats.
- Fit it to the requested duration: ${budgetBrief(req.duration, duration?.label)}. If the script is longer than that, compress the wording and merge beats — never drop a beat, never drop the ending, and never add a new story the script doesn't contain.
- If the script says something that contradicts the story bible, the script wins for this episode.
`.trim()
    : "";

  // Series songs see the whole season and where this one sits in it.
  const seasonBlock =
    seasonEpisode || pastFinale
      ? `\n${seasonBrief(seasonEpisode, arc)}\n`
      : "";

  return `EPISODE REQUEST
================
Selected episode theme: ${seasonEpisode || pastFinale ? episode?.label : req.episodeLabel}
Story arc guidance: ${episodeArc}
Custom topic (if any): ${req.customTopic ?? "(none)"}
Custom script: ${script ? "YES — see SCRIPT TO FOLLOW below, it outranks the arc and topic" : "(none)"}
${seasonBlock}
Song duration: ${req.duration} (${duration?.words ?? "appropriate length"})
LYRIC BUDGET (hard): ${budgetBrief(req.duration, duration?.label)}
END THE SONG PROPERLY: the last line sung is the punchline, sized to land inside ${req.duration}.
Comedy intensity: ${req.intensity} — ${intensity?.hint ?? "Joe's signature ridiculous."}
Primary target audience: ${targetLabel}
Crooner style: ${style.label} — ${style.description} (Suggested tempo: ${style.bpm} BPM)

OUTPUT LANGUAGE: ${lang.label} (${lang.nativeLabel})
${lang.prompt}
Audience-facing copy must be in ${lang.label}; musicalDirection, performanceNotes and storyBibleUpdate stay in English. The previous episode may be in another language — if it is, rewrite it into ${lang.label}.

ACTION REQUESTED
================
${action?.label}: ${action?.instruction}
${scriptBlock ? `
${scriptBlock}
` : ""}
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
- Write the song itself in ${lang.label}. Compose it natively — do not translate.
- Keep Joe's crooner voice unmistakable.
- Stay on message: the job market, Joe adopting AI, or his AI bootcamp. Never a random-topic song.
- Lead with a hook that stops a social scroll.
- Stay inside the lyric budget, and end on the punchline — the last line sung.${script ? "\n- Cover every beat of the script, in its order. Joe's wording, the user's content." : ""}
- The storyBibleUpdate should reflect what genuinely changed in THIS episode.`;
}

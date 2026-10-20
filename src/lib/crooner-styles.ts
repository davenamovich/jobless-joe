/**
 * Crooner Style Presets
 *
 * The CORE of Joe's voice (working-class crooner, smoky baritone, exaggerated
 * sincerity, deadpan punchlines, overconfidence) is fixed in the system prompt
 * and never changes — that's what makes every song unmistakably Jobless Joe.
 *
 * What changes between styles is the MUSICAL DIRECTION: tempo, instrumentation,
 * mood, performance style. Each preset injects a paragraph into the system
 * prompt that overrides the default "1950s lounge singer meets big-band swing"
 * while leaving Joe's character intact.
 */

export interface CroonerStyle {
  key: string;
  label: string;
  /** Short description shown in the selector */
  description: string;
  /** One-emoji icon for compact display */
  emoji: string;
  /** The paragraph injected into the system prompt's MUSICAL STYLE section. */
  musicalDirection: string;
  /** Suggested BPM / tempo for the music-video mode */
  bpm: number;
}

export const CROONER_STYLES: CroonerStyle[] = [
  {
    key: "smoky-lounge",
    label: "Smoky Lounge",
    description: "Midnight bar, brushed drums, hushed piano. Joe at his most intimate.",
    emoji: "🥃",
    bpm: 72,
    musicalDirection:
      "Smoky late-night lounge. Hushed brushed drums, sparse upright bass, a single spotlight piano. Joe is one drink in, leaning close to the mic, half-whispering with maximum confidence. Long pauses. The room is silent. Tempo around 70 BPM. Restraint is the joke.",
  },
  {
    key: "big-band-vegas",
    label: "Big-Band Vegas",
    description: "Showroom horns, swagger for days, the room is yours.",
    emoji: "🎺",
    bpm: 124,
    musicalDirection:
      "Big-Band Vegas showroom. Full horn section, walking bass, brushed-but-loud snare, a tasteful string swell on the bridge. Joe is doing the second show of the night, tuxedo slightly loosened, owning the room. Tempo around 120 BPM. The comedy comes from Joe treating every line like a showstopper.",
  },
  {
    key: "late-night-radio",
    label: "Late-Night Radio",
    description: "AM warmth, intimate baritone, you're driving home at 2am.",
    emoji: "📻",
    bpm: 66,
    musicalDirection:
      "Late-night AM radio ballad. Warm close-mic baritone, gentle rhythm guitar, soft brushes, a discreet Hammond organ pad in the background. Joe is the DJ who refuses to stop singing. Tempo around 65 BPM. Nostalgia is the joke — modern absurdity delivered as if it were 1962.",
  },
  {
    key: "rat-pack-swagger",
    label: "Rat Pack Swagger",
    description: "Sharp suit, half a smile, the punchline lands before you notice.",
    emoji: "🍸",
    bpm: 108,
    musicalDirection:
      "Rat Pack swagger. Snap-along groove, walking bass, light hi-hat, tasteful muted trumpet fills. Joe is half-singing, half-talking, throwing away punchlines like he's bored of being funny. Tempo around 105 BPM. Cool is the joke — the more ridiculous the subject, the cooler Joe stays.",
  },
  {
    key: "noir-bourbon",
    label: "Noir Bourbon",
    description: "Detective ballad, ominous bass, Joe narrates his own downfall.",
    emoji: "🕵️",
    bpm: 58,
    musicalDirection:
      "Film-noir bourbon ballad. Slow walk bass, lonely muted trumpet, single piano notes with reverb, distant brushes. Joe is narrating his own ridiculous downfall like a Raymond Chandler detective. Tempo around 58 BPM. Doom is the joke — minor-key delivery of absurd AI frustrations.",
  },
  {
    key: "bourbon-street-brass",
    label: "Bourbon Street Brass",
    description: "New Orleans funeral strut. Joe is marching, the song is the parade.",
    emoji: "🎷",
    bpm: 96,
    musicalDirection:
      "New Orleans brass-band strut. Tubas, snare with rimshots, trombone slides, clarinet fills. Joe is leading a second-line parade down the street, singing his grievances like a celebration. Tempo around 95 BPM. Joyful complaint is the joke — every problem becomes a march.",
  },
  {
    key: "croon-and-sway",
    label: "Croon and Sway",
    description: "Slow-dance standard. Couples are swaying. Joe is the band.",
    emoji: "💃",
    bpm: 64,
    musicalDirection:
      "Slow-dance romantic standard. Lush strings, gentle piano, soft brushes, a saxophone solo on the bridge. Joe is singing to an empty room as if it were full of slow-dancing couples. Tempo around 60 BPM. Romantic sincerity aimed at ridiculous subjects is the joke.",
  },
  {
    key: "torch-song-blues",
    label: "Torch Song Blues",
    description: "Joe has been wronged. He is singing about it. At length.",
    emoji: "🕯️",
    bpm: 62,
    musicalDirection:
      "Torch song blues. Slow 12/8 feel, smoky tenor sax, walking bass, brushes, dramatic piano chords. Joe is wronged, and he is going to tell you about it for three verses too long. Tempo around 60 BPM. Wounded dignity is the joke — Joe treats minor inconveniences like heartbreak.",
  },
];

/**
 * ACE 1.5 — CROONER STYLE PROMPT
 *
 * The fixed voice + arrangement brief for every ACE-Step render. It is the
 * same line-for-line on every episode, so Joe is unmistakably the same singer
 * from song to song; only the short episode detail appended by
 * buildAceCaption() changes.
 *
 * Edit with care — this is Joe's actual voice, not a suggestion.
 */
export const ACE_CROONER_STYLE_PROMPT =
  "Solo male lead vocal: Jobless Joe, a classic vintage crooner with a smooth and confident male baritone, old-school lounge singer charm, Sinatra-inspired phrasing, rich warm tone, playful comedic delivery, dramatic pauses, subtle swing, jazzy piano, upright bass, brushed drums, muted trumpet, and lush orchestral strings. Timeless 1950s nightclub atmosphere with modern, witty storytelling. Clear male vocals front and center, expressive phrasing, and a charismatic storyteller vibe. An instantly hummable hook in the first ten seconds and a big singalong chorus that repeats the song title. Build the emotion and humor as the story unfolds, ending with a strong, catchy punchline. Clean, definitive ending: right after the last sung line the band lands one final sustained chord with a tight button ending; no fade-out, no abrupt cut-off, no trailing instrumental.";

/** Added to the caption on duet episodes. Joe stays the lead. */
export const ACE_DUET_PROMPT =
  "Duet: a sultry female guest vocalist answers Joe on one verse and joins him in harmony on the final chorus; Joe stays the lead singer.";

/** ACE-Step caption budget (characters). */
const ACE_CAPTION_LIMIT = 2000;
/** How much of the episode's musical direction we append after the fixed voice. */
const EPISODE_DETAILS_MAX = 400;
/** Roughly one song in five is a duet. */
const DUET_EVERY = 5;

/** Sentences in an episode's direction that would hand the lead to a woman. */
const FEMALE_LEAD = /\b(female|woman|women|girl|soprano|mezzo|diva|chanteuse|her voice)\b/i;

/**
 * Whether this episode is one of Joe's occasional duets. Stable per episode,
 * so re-rendering a song never flips it between solo and duet.
 */
export function isDuetEpisode(episodeId: string): boolean {
  let h = 0;
  for (let i = 0; i < episodeId.length; i++) h = (h * 31 + episodeId.charCodeAt(i)) >>> 0;
  return h % DUET_EVERY === 0;
}

/**
 * Mark the duet parts in the lyrics' section tags so ACE-Step knows who sings
 * what: the last verse after the first goes to the guest, the last chorus is
 * sung together. Lyrics without those sections come back unchanged.
 */
export function markDuetLyrics(lyrics: string): string {
  const tags = [...lyrics.matchAll(/\[(VERSE[^\]]*|CHORUS[^\]]*)\]/gi)];
  const verses = tags.filter((m) => /^VERSE/i.test(m[1]));
  const choruses = tags.filter((m) => /^CHORUS/i.test(m[1]));
  const marks = new Map<number, string>();
  if (verses.length > 1) marks.set(verses[verses.length - 1].index!, "female guest vocal");
  if (choruses.length) marks.set(choruses[choruses.length - 1].index!, "duet, both voices");
  let out = lyrics;
  [...marks.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([at, mark]) => {
      const close = out.indexOf("]", at);
      out = `${out.slice(0, close)} - ${mark}${out.slice(close)}`;
    });
  return out;
}

/**
 * Build the ACE-Step caption: the fixed Joe voice prompt, then a short
 * "this episode" clause for tempo / instrumentation.
 *
 * The fixed prompt always comes first and is never truncated, so a verbose
 * episode direction can't dilute or overwrite Joe's voice. On solo songs any
 * direction that would give the lead to a female singer is dropped; on duets
 * the duet line is added.
 */
export function buildAceCaption(
  output: {
    musicalDirection?: string;
    performanceNotes?: string;
  },
  opts: { duet?: boolean } = {}
): string {
  const details = [output.musicalDirection, output.performanceNotes]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => opts.duet || !FEMALE_LEAD.test(sentence))
    .join(" ")
    .slice(0, EPISODE_DETAILS_MAX);

  const voice = opts.duet ? `${ACE_CROONER_STYLE_PROMPT} ${ACE_DUET_PROMPT}` : ACE_CROONER_STYLE_PROMPT;
  if (!details) return voice;
  return `${voice} This episode: ${details}`.slice(0, ACE_CAPTION_LIMIT);
}

export function getCroonerStyle(key: string | undefined | null): CroonerStyle {
  if (!key) return CROONER_STYLES[0];
  return CROONER_STYLES.find((s) => s.key === key) ?? CROONER_STYLES[0];
}

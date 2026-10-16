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

export function getCroonerStyle(key: string | undefined | null): CroonerStyle {
  if (!key) return CROONER_STYLES[0];
  return CROONER_STYLES.find((s) => s.key === key) ?? CROONER_STYLES[0];
}

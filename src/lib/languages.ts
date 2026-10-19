/**
 * Song output languages.
 *
 * The studio UI stays English; this list only controls the language Joe
 * *performs* in — lyrics, title, hooks, ad copy, teaser and the video caption.
 * Production notes (musicalDirection / performanceNotes) and the story bible
 * stay in English: ACE-Step and the studio both read those.
 */

export interface LanguageDef {
  /** Key stored on the episode (e.g. "en", "pt-BR"). */
  key: string;
  /** English name, used in settings and chips. */
  label: string;
  /** Name in the language itself, shown in the picker. */
  nativeLabel: string;
  flag: string;
  /** Base code for ACE-Step's `vocal_language`. */
  ace: string;
  /** Instruction for the songwriter model, in English. */
  prompt: string;
  /** Localized video-caption lines. `{url}` / `{course}` are placeholders. */
  caption: {
    watch: string;
    cta: string;
  };
}

export const DEFAULT_LANGUAGE = "en";

export const LANGUAGES: LanguageDef[] = [
  {
    key: "en",
    label: "English",
    nativeLabel: "English",
    flag: "🇺🇸",
    ace: "en",
    prompt:
      "Write everything in natural, conversational English (American, everyday speech).",
    caption: {
      watch: "Watch the video: {url}",
      cta: "🎓 Free AI course for the unemployed (and everyone else): {course}",
    },
  },
  {
    key: "es",
    label: "Spanish",
    nativeLabel: "Español",
    flag: "🇪🇸",
    ace: "es",
    prompt:
      "Write everything in natural, conversational Spanish. Prefer neutral Latin American Spanish and avoid heavy regional slang. Build the jokes natively in Spanish instead of translating English puns.",
    caption: {
      watch: "Mira el video: {url}",
      cta: "🎓 Curso gratis de IA para desempleados (y para todos los demás): {course}",
    },
  },
  {
    key: "pt-BR",
    label: "Portuguese (Brazil)",
    nativeLabel: "Português (Brasil)",
    flag: "🇧🇷",
    ace: "pt",
    prompt:
      "Write everything in natural, conversational Brazilian Portuguese. Use the você register and everyday Brazilian phrasing — not European Portuguese. Jokes should be built natively, not translated.",
    caption: {
      watch: "Assista ao vídeo: {url}",
      cta: "🎓 Curso grátis de IA para desempregados (e para todo mundo): {course}",
    },
  },
  {
    key: "fr",
    label: "French",
    nativeLabel: "Français",
    flag: "🇫🇷",
    ace: "fr",
    prompt:
      "Write everything in natural, conversational French. Keep lines short enough to land spoken aloud; avoid literary tenses and formal constructions Joe would never use.",
    caption: {
      watch: "Regarde la vidéo : {url}",
      cta: "🎓 Cours d'IA gratuit pour les sans-emploi (et tout le monde) : {course}",
    },
  },
  {
    key: "de",
    label: "German",
    nativeLabel: "Deutsch",
    flag: "🇩🇪",
    ace: "de",
    prompt:
      "Write everything in natural, conversational German. Keep sentences short and speakable, and let the punchline sit at the end of the line.",
    caption: {
      watch: "Video ansehen: {url}",
      cta: "🎓 Kostenloser KI-Kurs für Arbeitslose (und alle anderen): {course}",
    },
  },
  {
    key: "it",
    label: "Italian",
    nativeLabel: "Italiano",
    flag: "🇮🇹",
    ace: "it",
    prompt:
      "Write everything in natural, conversational Italian. Lean on rhythm and wordplay; avoid overly formal or bureaucratic phrasing.",
    caption: {
      watch: "Guarda il video: {url}",
      cta: "🎓 Corso gratuito di IA per disoccupati (e per tutti gli altri): {course}",
    },
  },
  {
    key: "nl",
    label: "Dutch",
    nativeLabel: "Nederlands",
    flag: "🇳🇱",
    ace: "nl",
    prompt:
      "Write everything in natural, conversational Dutch. Keep lines plain and speakable; no stiff written-Dutch constructions.",
    caption: {
      watch: "Bekijk de video: {url}",
      cta: "🎓 Gratis AI-cursus voor werklozen (en iedereen): {course}",
    },
  },
  {
    key: "pl",
    label: "Polish",
    nativeLabel: "Polski",
    flag: "🇵🇱",
    ace: "pl",
    prompt:
      "Write everything in natural, conversational Polish. Keep lines short and singable — avoid long consonant clusters that are hard to perform.",
    caption: {
      watch: "Zobacz wideo: {url}",
      cta: "🎓 Darmowy kurs AI dla bezrobotnych (i wszystkich innych): {course}",
    },
  },
  {
    key: "tr",
    label: "Turkish",
    nativeLabel: "Türkçe",
    flag: "🇹🇷",
    ace: "tr",
    prompt:
      "Write everything in natural, conversational Turkish. Respect vowel harmony, use everyday speech, and keep lyric lines short.",
    caption: {
      watch: "Videoyu izle: {url}",
      cta: "🎓 İşsizler (ve herkes) için ücretsiz yapay zekâ kursu: {course}",
    },
  },
  {
    key: "ru",
    label: "Russian",
    nativeLabel: "Русский",
    flag: "🇷🇺",
    ace: "ru",
    prompt:
      "Write everything in natural, conversational Russian. Use the informal «ты» when Joe addresses the audience, and keep each line speakable.",
    caption: {
      watch: "Смотри видео: {url}",
      cta: "🎓 Бесплатный курс по ИИ для безработных (и всех остальных): {course}",
    },
  },
  {
    key: "uk",
    label: "Ukrainian",
    nativeLabel: "Українська",
    flag: "🇺🇦",
    ace: "uk",
    prompt:
      "Write everything in natural, conversational Ukrainian — not Russian. Use the informal «ти» for the audience and keep lines speakable.",
    caption: {
      watch: "Дивись відео: {url}",
      cta: "🎓 Безкоштовний курс зі штучного інтелекту для безробітних (і всіх інших): {course}",
    },
  },
  {
    key: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    flag: "🇮🇳",
    ace: "hi",
    prompt:
      "Write everything in natural, conversational Hindi in Devanagari script. Mix in the everyday English AI terms Indian speakers actually use (AI, prompt, app).",
    caption: {
      watch: "वीडियो देखें: {url}",
      cta: "🎓 बेरोज़गारों (और सब के लिए) मुफ़्त AI कोर्स: {course}",
    },
  },
  {
    key: "ja",
    label: "Japanese",
    nativeLabel: "日本語",
    flag: "🇯🇵",
    ace: "ja",
    prompt:
      "Write everything in natural, conversational Japanese using normal kana and kanji. Keep lyric lines short enough to sing, and let the joke land on the last mora.",
    caption: {
      watch: "動画はこちら：{url}",
      cta: "🎓 失業中の人も、そうでない人も。無料のAI講座：{course}",
    },
  },
  {
    key: "ko",
    label: "Korean",
    nativeLabel: "한국어",
    flag: "🇰🇷",
    ace: "ko",
    prompt:
      "Write everything in natural, conversational Korean. Use 해요체 for spoken lines and keep them rhythmically singable.",
    caption: {
      watch: "영상 보기: {url}",
      cta: "🎓 실업자와 모두를 위한 무료 AI 강좌: {course}",
    },
  },
  {
    key: "zh",
    label: "Chinese (Simplified)",
    nativeLabel: "中文（简体）",
    flag: "🇨🇳",
    ace: "zh",
    prompt:
      "Write everything in natural, conversational Simplified Chinese. Keep lines short and rhythmic; no classical or bureaucratic phrasing.",
    caption: {
      watch: "观看视频：{url}",
      cta: "🎓 给失业者（以及所有人）的免费 AI 课程：{course}",
    },
  },
  {
    key: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    flag: "🇸🇦",
    ace: "ar",
    prompt:
      "Write everything in natural, conversational Modern Standard Arabic. Keep each line short and speakable, and avoid ornate literary constructions.",
    caption: {
      watch: "شاهد الفيديو: {url}",
      cta: "🎓 دورة مجانية في الذكاء الاصطناعي للعاطلين عن العمل (وللجميع): {course}",
    },
  },
  {
    key: "id",
    label: "Indonesian",
    nativeLabel: "Bahasa Indonesia",
    flag: "🇮🇩",
    ace: "id",
    prompt:
      "Write everything in natural, conversational Indonesian. Use everyday, Jakarta-neutral phrasing rather than formal written Indonesian.",
    caption: {
      watch: "Tonton videonya: {url}",
      cta: "🎓 Kursus AI gratis untuk yang menganggur (dan semua orang): {course}",
    },
  },
];

export function getLanguage(key: string | null | undefined): LanguageDef {
  if (!key) return LANGUAGES[0];
  return LANGUAGES.find((l) => l.key === key) ?? LANGUAGES[0];
}

export function isLanguageKey(key: unknown): key is string {
  return typeof key === "string" && LANGUAGES.some((l) => l.key === key);
}

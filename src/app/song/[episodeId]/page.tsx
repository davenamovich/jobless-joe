import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Disc3, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SongPlayer } from "@/components/joe/SongPlayer";
import { SongPanel } from "@/components/joe/SongPanel";
import { db } from "@/lib/db";
import { loadBackendConfig } from "@/lib/ai-backend";
import { getCroonerStyle } from "@/lib/crooner-styles";
import { getLanguage } from "@/lib/languages";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadEpisode(episodeId: string) {
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode) return null;

  let output: SongOutput | null = null;
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    output = null;
  }

  const track = await db.audioTrack.findFirst({
    where: { episodeId },
    orderBy: { createdAt: "desc" },
  });

  return { episode, output, track };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const data = await loadEpisode(episodeId);
  if (!data) return { title: "Song not found — Jobless Joe" };
  const title = data.output?.episodeTitle || data.episode.title || "Untitled Song";
  const description =
    data.output?.musicalDirection || "A Jobless Joe crooner song.";
  return {
    title: `${title} — Jobless Joe`,
    description,
    openGraph: { title: `${title} — Jobless Joe`, description },
  };
}

export default async function SongPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const [data, cfg] = await Promise.all([
    loadEpisode(episodeId),
    loadBackendConfig(),
  ]);
  if (!data) notFound();

  const { episode, output, track } = data;
  const title = output?.episodeTitle || episode.title || "Untitled Song";
  const style = getCroonerStyle(episode.croonerStyle);
  const language = getLanguage(episode.language);

  return (
    <div className="min-h-screen lounge-bg">
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the studio
          </Link>
          <span className="text-[0.65rem] uppercase tracking-[0.22em] text-primary font-semibold">
            Jobless Joe
          </span>
        </div>

        <header className="flex items-start gap-4 md:gap-5 mb-6">
          <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
            <Disc3 className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              {episode.episodeLabel}
            </p>
            <h1 className="font-serif text-3xl md:text-5xl leading-tight marquee-line">
              {title}
            </h1>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="secondary">{output?.duration || episode.duration}</Badge>
              <Badge variant="outline" className="gap-1">
                <Music2 className="h-3 w-3" />
                {style.emoji} {style.label}
              </Badge>
              {language.key !== "en" && (
                <Badge variant="outline">
                  {language.flag} {language.nativeLabel}
                </Badge>
              )}
              {track && (
                <Badge variant="outline" className="font-mono text-[0.7rem] uppercase">
                  {track.format}
                </Badge>
              )}
            </div>
          </div>
        </header>

        <Card className="spotlight border-primary/30">
          <CardContent className="pt-6">
            {track ? (
              <SongPlayer
                episodeId={episode.id}
                title={title}
                audioUrl={track.filePath}
                format={track.format}
                durationSec={track.durationSec}
                showPageLink={false}
              />
            ) : (
              <SongPanel
                episodeId={episode.id}
                title={title}
                showPageLink={false}
              />
            )}
          </CardContent>
        </Card>

        {output?.musicalDirection && (
          <p className="mt-6 rounded-lg border-l-2 border-primary bg-secondary/30 px-4 py-3 text-sm italic text-foreground/80 leading-relaxed">
            {output.musicalDirection}
          </p>
        )}

        <section className="mt-10">
          <h2 className="font-serif text-xl mb-4 flex items-center gap-2">
            <Music2 className="h-4 w-4 text-primary" />
            Lyrics
          </h2>
          <div className="rounded-xl border border-border/60 bg-card px-5 py-5">
            {(output?.lyrics || "No lyrics saved for this episode.")
              .split(/\r?\n/)
              .map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2.5" />;
                const tag = /^\[([^\]]+)\]$/.exec(trimmed);
                if (tag) {
                  return (
                    <p
                      key={i}
                      className="mt-4 first:mt-0 text-[0.65rem] uppercase tracking-[0.18em] text-primary font-semibold"
                    >
                      {tag[1]}
                    </p>
                  );
                }
                return (
                  <p key={i} className="font-serif text-lg leading-relaxed text-foreground/90">
                    {trimmed}
                  </p>
                );
              })}
          </div>
        </section>

        {output?.closingLine && (
          <p className="mt-8 text-center font-serif italic text-lg text-foreground/80">
            “{output.closingLine}”
          </p>
        )}

        {/* Free-course CTA — Joe's whole point. */}
        {cfg.courseUrl && (
          <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-primary font-semibold">
              Jobless Joe&apos;s Bootcamp
            </p>
            <p className="mt-2 font-serif text-xl leading-snug">
              You don&apos;t need a degree to start building with AI.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Joe is proof of concept. Take the free course and start asking
              better questions.
            </p>
            <a
              href={cfg.courseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              🎓 Start the free AI course
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

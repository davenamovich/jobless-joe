"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  Bot,
  Drama,
  Hammer,
  Mic,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { StoryBible } from "@/lib/joe-prompts";

interface Props {
  storyBible: StoryBible | null;
}

export function StoryBibleCard({ storyBible }: Props) {
  if (!storyBible) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          The Story Bible appears here after your first generation.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero strip — Joe's current situation */}
      <Card className="spotlight overflow-hidden border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-primary">
            <Mic className="h-5 w-5" />
            <CardTitle className="font-serif text-xl">Joe Right Now</CardTitle>
            <Badge variant="secondary" className="ml-auto">
              Episode {storyBible.episodeCount}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="font-serif italic text-base text-foreground/90 leading-relaxed">
            “{storyBible.currentSituation}”
          </p>
          {storyBible.nextDevelopment && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground/80">Next:</span>{" "}
              {storyBible.nextDevelopment}
            </p>
          )}
        </CardContent>
      </Card>

      <Accordion
        type="multiple"
        defaultValue={[
          "skills",
          "built",
          "characters",
          "jokes",
          "punchlines",
          "unresolved",
        ]}
        className="w-full"
      >
        <BibleSection
          value="skills"
          icon={<Sparkles className="h-4 w-4" />}
          title="Skills Joe Has Learned"
          items={storyBible.learnedSkills}
          emptyText="Joe hasn't picked up any new tricks yet. He's still amazed by autocomplete."
        />
        <BibleSection
          value="built"
          icon={<Hammer className="h-4 w-4" />}
          title="Things Joe Has Built"
          items={storyBible.builtThings}
          emptyText="Joe hasn't shipped anything yet. The workshop is still warming up."
        />
        <BibleSection
          value="characters"
          icon={<Drama className="h-4 w-4" />}
          title="Recurring Characters"
          items={storyBible.characters}
          emptyText="Just Joe and his microphone. For now."
        />
        <BibleSection
          value="jokes"
          icon={<Bot className="h-4 w-4" />}
          title="Running Jokes"
          items={storyBible.runningJokes}
          emptyText="No callbacks yet. The first joke is always the hardest."
        />
        <BibleSection
          value="punchlines"
          icon={<Mic className="h-4 w-4" />}
          title="Past Punchlines"
          items={storyBible.previousPunchlines}
          emptyText="No quotables in the vault yet."
          asQuotes
        />
        <BibleSection
          value="unresolved"
          icon={<TrendingUp className="h-4 w-4" />}
          title="Unresolved Storylines"
          items={storyBible.unresolvedStorylines}
          emptyText="Nothing dangling — Joe's plate is clean. For now."
        />
      </Accordion>
    </div>
  );
}

function BibleSection({
  value,
  icon,
  title,
  items,
  emptyText,
  asQuotes = false,
}: {
  value: string;
  icon: React.ReactNode;
  title: string;
  items: string[];
  emptyText: string;
  asQuotes?: boolean;
}) {
  return (
    <AccordionItem value={value} className="border-b border-border/60">
      <AccordionTrigger className="hover:no-underline py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="text-primary">{icon}</span>
          {title}
          {items.length > 0 && (
            <Badge variant="outline" className="ml-1 text-[0.65rem]">
              {items.length}
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{emptyText}</p>
        ) : asQuotes ? (
          <ul className="space-y-2">
            {items.map((p, i) => (
              <li
                key={i}
                className="font-serif italic text-sm text-foreground/90 border-l-2 border-primary/40 pl-3"
              >
                “{p}”
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item, i) => (
              <li key={i}>
                <Badge
                  variant="secondary"
                  className="text-[0.78rem] leading-relaxed whitespace-normal text-left max-w-full"
                >
                  {item}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function StoryBibleCompact({ storyBible }: Props) {
  if (!storyBible) return null;
  return (
    <Card className="bg-secondary/30 border-dashed">
      <CardContent className="py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground/80">
          Story Bible — Episode {storyBible.episodeCount}
        </span>
        <span className="opacity-50">·</span>
        <span className="line-clamp-1">
          {storyBible.characters.length} characters ·{" "}
          {storyBible.learnedSkills.length} skills · {storyBible.builtThings.length} builds
        </span>
      </CardContent>
    </Card>
  );
}

// Run: npx tsx --test src/lib/crooner-styles.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACE_CROONER_STYLE_PROMPT, ACE_DUET_PROMPT, buildAceCaption, isDuetEpisode, markDuetLyrics } from "./crooner-styles";

describe("ACE caption", () => {
  it("keeps Joe the male lead and drops a female lead from solo songs", () => {
    const cap = buildAceCaption({ musicalDirection: "Slow swing at 92 BPM. A sultry female vocalist takes the lead. Muted trumpet solo." });
    assert.ok(cap.startsWith(ACE_CROONER_STYLE_PROMPT));
    assert.ok(cap.includes("92 BPM") && cap.includes("Muted trumpet"));
    assert.ok(!/female vocalist takes/i.test(cap));
    assert.ok(!cap.includes(ACE_DUET_PROMPT));
  });

  it("adds the duet line on duet songs", () => {
    assert.ok(buildAceCaption({}, { duet: true }).includes(ACE_DUET_PROMPT));
  });

  it("asks for a clean ending", () => {
    assert.match(ACE_CROONER_STYLE_PROMPT, /no fade-out/);
  });
});

describe("duets", () => {
  it("about one song in five is a duet, stable per episode", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `cmvg${i.toString(36)}xyz`);
    const duets = ids.filter(isDuetEpisode).length;
    assert.ok(duets > 120 && duets < 280, String(duets));
    assert.equal(isDuetEpisode("abc"), isDuetEpisode("abc"));
  });

  it("gives the guest the last verse and shares the last chorus", () => {
    const out = markDuetLyrics("[VERSE 1]\na\n[CHORUS]\nb\n[VERSE 2]\nc\n[CHORUS]\nd\n[OUTRO]\ne");
    assert.equal(out, "[VERSE 1]\na\n[CHORUS]\nb\n[VERSE 2 - female guest vocal]\nc\n[CHORUS - duet, both voices]\nd\n[OUTRO]\ne");
    assert.equal(markDuetLyrics("[VERSE]\nonly\n[OUTRO]\nx"), "[VERSE]\nonly\n[OUTRO]\nx");
  });
});

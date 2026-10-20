import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMorningDue, localDayHour } from "./morning-autopilot";

describe("Morning Show schedule", () => {
  it("reads the local day and hour in a time zone", () => {
    // 13:30 UTC is 09:30 in New York (EDT) on Oct 20.
    assert.deepEqual(localDayHour(new Date("2026-10-20T13:30:00Z"), "America/New_York"), {
      day: "2026-10-20",
      hour: 9,
    });
  });

  it("waits for the hour, then runs once that local day", () => {
    const tz = "America/New_York";
    const at6 = new Date("2026-10-20T10:00:00Z"); // 6am NY
    const at7 = new Date("2026-10-20T11:05:00Z"); // 7:05am NY
    assert.equal(isMorningDue(at6, 7, tz, null), false);
    assert.equal(isMorningDue(at7, 7, tz, null), true);
    assert.equal(isMorningDue(at7, 7, tz, new Date("2026-10-20T11:01:00Z")), false);
    // Yesterday's run doesn't count for today.
    assert.equal(isMorningDue(at7, 7, tz, new Date("2026-10-19T11:01:00Z")), true);
    // 11pm NY on the 19th is already the 20th in UTC: still yesterday locally.
    assert.equal(isMorningDue(at7, 7, tz, new Date("2026-10-20T03:00:00Z")), true);
  });
});

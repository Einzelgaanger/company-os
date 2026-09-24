// A connected-app meeting arrives as one whole call. Nothing is extracted
// until a person tags that call for privacy; commitments then inherit the
// call's label.

export function isHeldMeeting(meeting: { privacy_held?: boolean }): boolean {
  return meeting.privacy_held === true;
}

/** Pull concrete follow-ups out of a held transcript for the mock plane. */
export function draftCommitmentsFromCall(
  transcript: string | null | undefined,
  title: string | null | undefined,
): { title: string; description: string; source_quote: string }[] {
  const text = (transcript ?? "").trim();
  const heading = (title ?? "this call").trim() || "this call";
  if (!text) {
    return [{ title: `Follow up from ${heading}`, description: heading, source_quote: heading }];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const hits = sentences.filter((s) =>
    /\b(will|need to|needs to|send|share|draft|by friday|due|close|review)\b/i.test(s),
  );
  const picked = (hits.length ? hits : sentences).slice(0, 5);
  if (picked.length === 0) {
    return [{ title: `Follow up from ${heading}`, description: text.slice(0, 240), source_quote: text.slice(0, 180) }];
  }
  return picked.map((s) => ({
    title: s.replace(/^[A-Za-z][A-Za-z .]{0,24}:\s*/, "").slice(0, 90),
    description: s,
    source_quote: s,
  }));
}

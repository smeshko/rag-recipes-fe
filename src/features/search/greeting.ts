/* The greeting was hard-coded to "Good morning", which reads as a bug to
   anyone who opens the app after lunch.
 *
 * The reader's clock, not the server's — they are the one having the evening.
 * Boundaries are the conventional English ones: 05:00–11:59 morning,
 * 12:00–17:59 afternoon, 18:00 onwards evening. The small hours fall into
 * evening rather than growing a fourth "Good night", which is a farewell and
 * an odd thing to greet someone with. */
export function greetingFor(now: Date = new Date()): string {
  const hour = now.getHours();
  /* Evening first, and it owns BOTH ends of the day — 18:00 onwards and
     everything before 05:00. Ordered morning-first, the small hours fall
     through `hour < 18` and greet a 3am cook with "Good afternoon". */
  if (hour >= 18 || hour < 5) {
    return "Good evening";
  }
  return hour < 12 ? "Good morning" : "Good afternoon";
}

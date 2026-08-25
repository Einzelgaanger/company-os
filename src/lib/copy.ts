/** §9.4 copy deck — empty/error strings from docs/buildguide/09_UI_PAGES.md */

export const COPY = {
  "C-DASH-EMPTY":
    "Nothing to show yet. Connect your meeting tool and Loop will start tracking commitments automatically.",
  "C-ERR-GENERIC": "Something went wrong loading this. Try again.",
  "C-COMMIT-EMPTY":
    "Nothing owed right now. Loop adds items here automatically from your meetings.",
  "C-ESC-EMPTY": "Nothing escalated. Everything's moving on its own.",
  "C-REVIEW-EMPTY": "Nothing needs review. Loop is confident about everything it's found.",
  "C-OWNMAP-EMPTY":
    "Add at least one category so Loop knows who to route blockers to. Until then, escalations go to the requester's manager.",
  "C-SURVEY-SUPPRESSED":
    "Not enough responses to report on this cycle without identifying individuals.",
  "C-LASTOWNER":
    "This is the only Owner on the account. Assign another Owner before changing this role.",
  "C-DISCONNECT":
    "Disconnect {provider}? Loop will stop reading new data from this source. Items already tracked stay.",
  "C-WHATSAPP-OFF":
    "Check-ins are off for you. Loop won't message you, and your work items stay visible here.",
  "C-CONN-BROKEN":
    "{provider} needs reconnecting. Loop hasn't been able to read new data since {when}.",
} as const;

export type CopyKey = keyof typeof COPY;

export function t(key: CopyKey, vars?: Record<string, string>): string {
  let s: string = COPY[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}

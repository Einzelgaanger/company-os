/**
 * Company OS brand — forest + lime visual grammar.
 *
 * Product world: Operators and leads who refuse to lose commitments in chat.
 * Mark: geometric C monogram + lime status node (“the operating system for work follow-through”).
 *
 * Neutrals are deliberately non-green so forest + lime stay the only green poles.
 * Warning chrome uses the `waiting` status tokens — never a separate gold family.
 */
export const BRAND = {
  name: "Company OS",
  shortName: "Company",
  slogan: "Your Agentic Chief Of Staff",
  tagline: "Your Agentic Chief Of Staff",
  promise:
    "Captures owned commitments from work already in motion, checks in on Chat or each person's channel and when someone is stuck finds who can unblock them. Project leads get the operating picture without another board to babysit.",
  world:
    "For operators keeping team promises alive: desks, phones, calendars; never clinics or warehouses.",
  markExplain: "The operating system for work follow-through.",

  forest: "#0E1F1A",
  forestDeep: "#0A1712",
  forestHover: "#1A3A2E",
  forestSoft: "#173028",

  lime: "#D3F36B",
  limeBright: "#C8F14A",
  /** Soft lime wash for selected / hover identity — not a page neutral. */
  accentWash: "#F4FBE3",

  paper: "#FFFFFF",
  soft: "#F8F8F7",
  ambient: "#EFEFEE",
  hairline: "#E5E5E2",
  nearWhite: "#F4F5F3",
  /** Primary copy on forest surfaces (boot screen, dark bubbles). */
  onForest: "#F4F7F5",
  /** Outbound chat bubble fill. */
  chatOutbound: "#E8F0E9",
  muted: "#5B6560",

  authHero: "/auth-portal-hero.jpg",
  portalBackdrop: "/images/portal-backdrop.jpg",
  marketingHero: "/images/marketing-hero.jpg",
  ogImage: "/og-image.jpg",
  ogWhatsapp: "/og-whatsapp.jpg",
  ribbonDesk: "/images/ribbon-desk.jpg",
  ribbonCheckin: "/images/ribbon-checkin.jpg",
  ribbonEscalate: "/images/ribbon-escalate.jpg",
  favicon: "/mark.svg",
} as const;

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand/LoopMark";
import { BRAND } from "@/lib/brand";
import "@/styles/loop-marketing.css";

const HERO = BRAND.marketingHero;

const FLOW = [
  {
    n: "01",
    title: "Detect",
    body: "Meetings and chat become owned commitments with a review gate when confidence is low. Notes stop evaporating after the call.",
  },
  {
    n: "02",
    title: "Track",
    body: "Every item has an owner, a due date and a waiting trail. The company can see what is actually in motion.",
  },
  {
    n: "03",
    title: "Check",
    body: "People get calm prompts in Chat by default, or on Telegram or WhatsApp when they link a channel. Facts about the work, not another status colour.",
  },
  {
    n: "04",
    title: "Nudge",
    body: "Silence gets a human follow-up before the stall becomes political. Soft first. Then louder, by policy.",
  },
  {
    n: "05",
    title: "Escalate",
    body: "When work is stuck, Company OS reads the trail (who owns it, what it depends on, who can unblock it) and routes the ask there. People are not left to guess, chase or escalate themselves.",
  },
  {
    n: "06",
    title: "Report",
    body: "Project managers and leads receive governed reports: where time went, what is waiting, what moved and what needs a decision.",
  },
] as const;

const CHANNELS = [
  {
    n: "01",
    kicker: "Check-ins",
    title: "Daily prompts that sound like staff, not spam",
    body: "Company OS checks in on live work the way a chief of staff would: short, specific and timed to the item, not a blast to the whole company. Owners reply in Chat or the channel they already live in. The system records the answer. Only when something is actually stuck does it escalate: with context, not panic.",
  },
  {
    n: "02",
    kicker: "Escalation",
    tone: "forest",
    title: "Unblock without the stress",
    body: "When someone is blocked, Company OS already has the meeting notes, owners and dependencies. It knows who to ask next so the person doing the work does not have to chase sideways, and the project manager does not have to hunt for the right inbox. Escalation arrives with judgment: the right person, the right tone, not a public pile-on.",
  },
  {
    n: "03",
    kicker: "Reports",
    title: "Reports for people who run projects",
    body: "Leads see project health, waiting time, open decisions and follow-through on commitments, scoped to their projects, not a company-wide dump. This is operational visibility: who is holding work, what is blocked, what closed. It is not a scorecard for promotion or discipline.",
  },
] as const;

const MODES = [
  {
    title: "Studios & agencies",
    body: "Informal, fast, everyone on chat. Company OS finds who to ask and asks for you: light check-ins, lateral unblocks.",
  },
  {
    title: "Founding teams",
    body: "One principal, many threads. Surface only what needs their call. Keep the decision queue short and visible.",
  },
  {
    title: "Operations & process",
    body: "Defined steps and SLAs. Prompt only on exception. Escalate when a step exceeds the time it should take.",
  },
  {
    title: "Multi-division groups",
    body: "Roll up deliverable variance per division without micromanaging how each team works inside the box.",
  },
  {
    title: "Professional practices",
    body: "Law, engineering, audit. Track only commitments owed across a boundary. Never supervise how a professional does the work.",
  },
] as const;

const AUDIENCE = [
  {
    n: "01",
    who: "Project managers",
    title: "Know the project without chasing it",
    points: [
      "Weekly (and optional daily) reports on waiting time, blockers and what actually moved",
      "Per-project health: fever, buffer, items waiting, direction versus last week",
      "See follow-through by owner and team: operational, not a people-ranking board",
    ],
  },
  {
    n: "02",
    who: "Operators & leads",
    tone: "forest",
    title: "Keep promises alive between meetings",
    points: [
      "One governed loop instead of a graveyard of Slack threads and spreadsheet trackers",
      "Escalations that arrive with judgment: quiet for ops, louder when the cost of delay is real",
      "A waiting register: what is stuck, on whom and who can unstick it",
    ],
  },
  {
    n: "03",
    who: "Everyone doing the work",
    title: "Answer once. Get help, not heat.",
    points: [
      "A short prompt about the last thing that moved, not a demand for a traffic-light status",
      "Reply in Chat, or on Telegram or WhatsApp when linked. The record updates everywhere.",
      "When you are stuck, Company OS uses context to find who can unblock you so you are not left chasing or stressed",
    ],
  },
] as const;

const RIBBONS = [
  {
    index: "01",
    title: "Commitments that close",
    body: "Every promise gets an owner, a due date and a trail so follow-through is the default, across any company shape you run.",
    img: BRAND.ribbonDesk,
    reverse: false,
    forest: false,
  },
  {
    index: "02",
    title: "Check-ins that feel human",
    body: "Chat, Telegram and WhatsApp (when connected) prompts that sound like a chief of staff: specific to the work, never a bot spam blast.",
    img: BRAND.ribbonCheckin,
    reverse: true,
    forest: true,
  },
  {
    index: "03",
    title: "Escalations that take the weight off people",
    body: "Stuck work does not mean you have to stress or guess who to ping. Company OS uses owners, dependencies and how your company coordinates to route the ask to the person who can actually unblock it: quietly when that is enough, louder when delay is expensive.",
    img: BRAND.ribbonEscalate,
    reverse: false,
    forest: false,
  },
] as const;

/** Corner motif for each operating-loop beat. Lime, clipped by the step. */
function BeatShape({ index }: { index: number }) {
  return (
    <svg className="mk-rail__shape" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      {index === 0 && (
        <>
          <path d="M18 108 A78 78 0 0 1 148 72" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <path d="M34 108 A56 56 0 0 1 132 78" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.62" />
          <circle cx="22" cy="108" r="6" fill="currentColor" opacity="0.9" />
          <circle cx="128" cy="74" r="4" fill="currentColor" opacity="0.75" />
        </>
      )}
      {index === 1 && (
        <>
          <path
            d="M12 96 C 48 96, 52 36, 92 36 S 128 78, 152 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="3 7"
            strokeLinecap="round"
            opacity="0.7"
          />
          <circle cx="28" cy="92" r="4" fill="currentColor" opacity="0.45" />
          <circle cx="72" cy="48" r="4.5" fill="currentColor" opacity="0.65" />
          <circle cx="112" cy="52" r="4" fill="currentColor" opacity="0.5" />
          <circle cx="148" cy="30" r="6" fill="currentColor" opacity="0.9" />
        </>
      )}
      {index === 2 && (
        <>
          <rect x="22" y="16" width="116" height="68" rx="18" fill="currentColor" opacity="0.08" />
          <rect x="22" y="16" width="116" height="68" rx="18" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
          <path d="M48 84 L40 108 L72 84" fill="currentColor" opacity="0.35" />
          <circle cx="52" cy="50" r="4" fill="currentColor" opacity="0.7" />
          <circle cx="80" cy="50" r="4" fill="currentColor" opacity="0.5" />
          <circle cx="108" cy="50" r="4" fill="currentColor" opacity="0.35" />
        </>
      )}
      {index === 3 && (
        <>
          <circle cx="104" cy="72" r="52" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
          <circle cx="104" cy="72" r="34" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
          <circle cx="104" cy="72" r="16" fill="currentColor" opacity="0.28" />
          <circle cx="104" cy="72" r="5" fill="currentColor" opacity="0.9" />
        </>
      )}
      {index === 4 && (
        <>
          <polyline points="28,96 70,54 112,96" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" opacity="0.35" />
          <polyline points="44,78 86,36 128,78" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
          <polyline points="60,60 102,18 144,60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
        </>
      )}
      {index === 5 && (
        <>
          <rect x="28" y="68" width="22" height="40" rx="5" fill="currentColor" opacity="0.28" />
          <rect x="62" y="44" width="22" height="64" rx="5" fill="currentColor" opacity="0.48" />
          <rect x="96" y="22" width="22" height="86" rx="5" fill="currentColor" opacity="0.72" />
        </>
      )}
    </svg>
  );
}

/** Corner motif for each coordination-mode card. Lime, clipped by the card. */
function ModeShape({ index }: { index: number }) {
  return (
    <svg className="mk-modes__shape" viewBox="0 0 160 130" aria-hidden="true" focusable="false">
      {index === 0 && (
        <>
          <circle cx="108" cy="78" r="46" fill="currentColor" opacity="0.1" />
          <circle cx="108" cy="78" r="46" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
          <circle cx="74" cy="96" r="28" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <circle cx="128" cy="52" r="16" fill="currentColor" opacity="0.28" />
          <circle cx="92" cy="86" r="5" fill="currentColor" opacity="0.9" />
        </>
      )}
      {index === 1 && (
        <>
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55">
            <line x1="36" y1="118" x2="18" y2="36" />
            <line x1="36" y1="118" x2="62" y2="18" />
            <line x1="36" y1="118" x2="108" y2="12" />
            <line x1="36" y1="118" x2="148" y2="28" />
            <line x1="36" y1="118" x2="154" y2="72" />
          </g>
          <circle cx="36" cy="118" r="7" fill="currentColor" opacity="0.9" />
          <circle cx="108" cy="12" r="3.5" fill="currentColor" opacity="0.75" />
          <circle cx="148" cy="28" r="3" fill="currentColor" opacity="0.55" />
          <circle cx="62" cy="18" r="2.5" fill="currentColor" opacity="0.5" />
        </>
      )}
      {index === 2 && (
        <>
          <rect x="18" y="28" width="128" height="14" rx="7" fill="currentColor" opacity="0.18" />
          <rect x="42" y="52" width="104" height="14" rx="7" fill="currentColor" opacity="0.32" />
          <rect x="66" y="76" width="80" height="14" rx="7" fill="currentColor" opacity="0.5" />
          <rect x="90" y="100" width="56" height="14" rx="7" fill="currentColor" opacity="0.78" />
        </>
      )}
      {index === 3 && (
        <>
          <rect x="28" y="18" width="48" height="48" rx="10" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <rect x="84" y="18" width="48" height="48" rx="10" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <rect x="28" y="72" width="48" height="48" rx="10" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <rect x="90" y="78" width="48" height="48" rx="10" fill="currentColor" opacity="0.22" />
          <rect x="90" y="78" width="48" height="48" rx="10" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
        </>
      )}
      {index === 4 && (
        <>
          <circle cx="90" cy="74" r="46" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 7" opacity="0.45" />
          <circle cx="90" cy="74" r="28" stroke="currentColor" strokeWidth="1.7" opacity="0.65" />
          <circle cx="90" cy="74" r="12" fill="currentColor" opacity="0.24" />
          <circle cx="90" cy="74" r="4.5" fill="currentColor" opacity="0.9" />
        </>
      )}
    </svg>
  );
}

function Reveal({
  children,
  className = "",
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: 1 | 2 | 3 | 4;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${delay ? `reveal-delay-${delay}` : ""} ${className}`}>
      {children}
    </div>
  );
}

export default function MarketingHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const p = Math.min(Math.max(window.scrollY / 180, 0), 1);
      setNavProgress(p);
      const el = navRef.current;
      if (!el) return;
      el.style.setProperty("--nav-progress", String(p));
      el.style.boxShadow =
        p > 0.08 ? `0 8px 28px rgba(14,31,26, ${0.07 * p})` : "none";
      el.style.backdropFilter = p > 0.05 ? `blur(${12 * p}px)` : "none";
      el.classList.toggle("scrolled", p > 0.72);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (mq.matches) setMenuOpen(false);
    };
    closeOnDesktop();
    mq.addEventListener("change", closeOnDesktop);
    return () => mq.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const howActive = navProgress > 0.35;

  return (
    <div className="loop-site">
      <nav ref={navRef} className="nav on-hero">
        <div className="container nav-inner">
          <Link to="/" className="brand brand--compact">
            <BrandMark className="h-9 w-9 sm:h-12 sm:w-12" />
            <span className="brand-word">{BRAND.name}</span>
          </Link>
          <div className="nav-links">
            <a href="#how" className={howActive ? "active" : undefined}>
              How it works
            </a>
            <a href="#teams">For teams</a>
            <a href="#reports">Reports</a>
            <a href="#product">Product</a>
            <Link to="/login" className="nav-sign">
              Sign in
            </Link>
          </div>
          <div className="nav-right">
            <Link to="/signup" className="btn btn-dark nav-cta-desktop">
              Get started</Link>
            <button
              type="button"
              className="nav-burger"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav-sheet" role="dialog" aria-modal>
          <button type="button" className="nav-sheet__scrim" aria-label="Close" onClick={() => setMenuOpen(false)} />
          <div className="nav-sheet__panel">
            <a href="#how" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#teams" onClick={() => setMenuOpen(false)}>
              For teams
            </a>
            <a href="#reports" onClick={() => setMenuOpen(false)}>
              Reports
            </a>
            <a href="#product" onClick={() => setMenuOpen(false)}>
              Product
            </a>
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-lime" onClick={() => setMenuOpen(false)}>
              Get started</Link>
          </div>
        </div>
      )}

      <section className="mk-hero">
        <div className="mk-hero__media" style={{ backgroundImage: `url('${HERO}')` }} aria-hidden />
        <div className="mk-hero__shade" aria-hidden />
        <div className="mk-hero__grain" aria-hidden />
        <div className="container mk-hero__inner">
          <h1 className="mk-brand">
            {BRAND.name}
          </h1>
          <div className="mk-hero__rule" aria-hidden />
          <p className="sub mk-hero__slogan">
            {BRAND.slogan}
          </p>
          <p className="sub">{BRAND.promise}</p>
          <div className="jump">
            <Link to="/signup" className="btn btn-lime">
              Start your workspace
            </Link>
            <a href="#how" className="btn btn-ghost-light">
              See how it works
            </a>
          </div>
        </div>
      </section>

      <div className="mk-slash" aria-hidden />

      <section id="problem" className="mk-problem">
        <span className="mk-problem__big" aria-hidden>
          Staff
        </span>
        <div className="container mk-problem__grid">
          <Reveal>
            <p className="label dark">The job</p>
            <h2>Work does not stall because people forget tasks. It stalls because waiting is invisible.</h2>
            <p className="body">
              A request sits in a thread. A date slips in a meeting that nobody wrote down. A project manager spends the week chasing
              updates instead of unblocking work. By Friday the report is a collage of optimistic greens. Company OS exists so that
              does not happen: for a five-person studio or a multi-division company.
            </p>
          </Reveal>
          <Reveal delay={2} className="mk-problem__aside">
            <p>
              {BRAND.name} is the agentic chief of staff that keeps follow-through alive: capture, prompt, escalate with
              context and report. People are not left chasing when work gets stuck.
            </p>
            <ul className="tick-list">
              {[
                "Extract and own every commitment",
                "Prompt people before silence calcifies",
                "When someone is stuck, find who can unblock them",
                "Escalate with context: no chasing, no stress pile-on",
                "Put project reports in the right hands",
              ].map((t) => (
                <li key={t}>
                  <span className="dot inline-flex items-center justify-center">
                    <Check className="h-3 w-3 text-[#0E1F1A]" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="how" className="mk-flow">
        <div className="container">
          <Reveal>
            <p className="label">How it works</p>
            <h2>Six beats. One continuous operating loop.</h2>
            <p className="mk-flow__lead">
              The product is not a board you babysit. It is a loop that runs while people do the work: detecting promises,
              checking in and writing the operating picture your leads already wish they had.
            </p>
          </Reveal>
          <div className="mk-rail mk-rail--six">
            {FLOW.map((step, i) => (
              <Reveal key={step.n} delay={(Math.min(i + 1, 4) as 1 | 2 | 3 | 4)} className="mk-rail__step">
                <BeatShape index={i} />
                <div className="mk-rail__disc">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-narrative">
        <div className="container">
          <Reveal>
            <p className="label dark">Daily operations</p>
            <h2>How people get prompted, how data stays true, how leads stay informed.</h2>
          </Reveal>
          <div className="mk-narrative__grid">
            {CHANNELS.map((c, i) => (
              <Reveal key={c.title} delay={(Math.min(i + 1, 4) as 1 | 2 | 3 | 4)}>
                <article className={`mk-narrative__card${"tone" in c ? " mk-narrative__card--forest" : ""}`}>
                  <span className="mk-narrative__ghost" aria-hidden>
                    {c.n}
                  </span>
                  <div className="mk-narrative__head">
                    <span className="mk-narrative__n">{c.n}</span>
                    <span className="mk-narrative__kicker">{c.kicker}</span>
                  </div>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="teams" className="mk-modes">
        <div className="container">
          <Reveal>
            <p className="label">Built for how companies actually coordinate</p>
            <h2>Not one industry template. A mode for how your organisation moves work.</h2>
            <p className="mk-modes__lead">
              A forty-person studio and a forty-person marketing agency often run the same way. A studio and a payments operations
              team do not. Company OS changes cadence, tone, who gets asked and how escalations route so it feels native, not
              bolted on.
            </p>
          </Reveal>
          <div className="mk-modes__grid">
            {MODES.map((m, i) => (
              <Reveal key={m.title} delay={(Math.min(i + 1, 4) as 1 | 2 | 3 | 4)} className="mk-modes__card">
                <ModeShape index={i} />
                <h3>{m.title}</h3>
                <p>{m.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="reports" className="mk-audience">
        <div className="container">
          <Reveal>
            <p className="label dark">Who it serves</p>
            <h2>Project managers get the picture. Operators keep the loop. People doing the work stay unhassled.</h2>
          </Reveal>
          <div className="mk-audience__grid">
            {AUDIENCE.map((a, i) => (
              <Reveal key={a.who} delay={(Math.min(i + 1, 4) as 1 | 2 | 3 | 4)}>
                <article className={`mk-audience__card${"tone" in a ? " mk-audience__card--forest" : ""}`}>
                  <span className="mk-audience__ghost" aria-hidden>
                    {a.n}
                  </span>
                  <div className="mk-audience__head">
                    <span className="mk-audience__n">{a.n}</span>
                    <p className="mk-audience__who">{a.who}</p>
                  </div>
                  <h3>{a.title}</h3>
                  <ul>
                    {a.points.map((p) => (
                      <li key={p}>
                        <span className="mk-audience__tick" aria-hidden>
                          <Check className="h-3 w-3 text-[#0E1F1A]" strokeWidth={3} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div id="product">
        {RIBBONS.map((r) => (
          <section
            key={r.index}
            className={`mk-ribbon${r.reverse ? " mk-ribbon--reverse" : ""}${r.forest ? " mk-ribbon--forest" : ""}`}
          >
            <div className="mk-ribbon__copy">
              <Reveal>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </Reveal>
            </div>
            <div className="mk-ribbon__media">
                <img src={r.img} alt={r.title} />
            </div>
          </section>
        ))}
      </div>

      <section className="mk-statement">
        <div className="container">
          <Reveal>
            <h2>Less chasing. More closing.</h2>
            <p className="mk-statement__sub">
              Waiting made visible. Follow-through made default. Reports that describe the work, never a ranking of people.
            </p>
          </Reveal>
        </div>
        <div className="mk-metrics">
          <div className="mk-metrics__cell">
            <strong>6</strong>
            <span>Beats in the operating loop</span>
          </div>
          <div className="mk-metrics__cell">
            <strong>1</strong>
            <span>Owner per commitment</span>
          </div>
          <div className="mk-metrics__cell">
            <strong>0</strong>
            <span>Dashboards to babysit</span>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="container relative z-10">
          <Reveal>
            <h2 className="max-w-[18ch] text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight text-[#0E1F1A]">
              Less chasing on your company. More work that closes.
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-[#0E1F1A]/70">
              Create a workspace, invite the people who hold work and connect Chat or the channels you already use. Company OS starts the loop.
            </p>
            <div className="mt-8">
              <Link to="/signup" className="btn btn-dark">
                Create your workspace</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="container">
          <div className="mk-footer__grid">
            <div>
              <div className="inline-flex items-center gap-3">
                <BrandMark className="h-9 w-9" />
                <span className="font-marketing text-lg font-bold text-white">{BRAND.name}</span>
              </div>
              <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-white/60">{BRAND.slogan}</p>
              <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-white/45">
                Captures commitments, checks in on Chat or messaging channels and escalates with context when work is stuck so people stop chasing.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <a href="#how">How it works</a>
              <a href="#teams">For teams</a>
              <a href="#reports">Reports</a>
              <a href="#product">Product</a>
              <Link to="/signup">Get started</Link>
            </div>
            <div>
              <h4>Workspace</h4>
              <Link to="/login">Sign in</Link>
              <Link to="/signup">Create account</Link>
            </div>
            <div>
              <h4>Trust</h4>
              <Link to="/privacy-policy">Privacy policy</Link>
              <Link to="/terms-of-service">Terms of service</Link>
            </div>
          </div>
          <div className="mk-footer__bottom">
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
            <span>
              <Link to="/privacy-policy">Privacy</Link>
              {" · "}
              <Link to="/terms-of-service">Terms</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

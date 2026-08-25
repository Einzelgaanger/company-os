import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand/LoopMark";
import { BRAND } from "@/lib/brand";
import "@/styles/loop-marketing.css";

const HERO = BRAND.marketingHero;

const FLOW = [
  { n: "01", title: "Capture", body: "Pull commitments from meetings, chat, and mail into one governed loop." },
  { n: "02", title: "Check in", body: "Owners get calm, timely prompts — not another dashboard to babysit." },
  { n: "03", title: "Nudge", body: "Silence triggers soft nudges before anything goes political." },
  { n: "04", title: "Escalate", body: "Stalls route by sensitivity — the right person, the right tone." },
] as const;

const RIBBONS = [
  {
    index: "01",
    title: "Commitments that close",
    body: "Every promise gets an owner, a due date, and a trail — so follow-through is the default.",
    img: BRAND.ribbonDesk,
    reverse: false,
    forest: false,
  },
  {
    index: "02",
    title: "Check-ins that feel human",
    body: "WhatsApp and email prompts that sound like a chief of staff, not a bot spam blast.",
    img: BRAND.ribbonCheckin,
    reverse: true,
    forest: true,
  },
  {
    index: "03",
    title: "Escalations with judgment",
    body: "Governance rules decide who sees what — quiet for ops, louder when it matters.",
    img: BRAND.ribbonEscalate,
    reverse: false,
    forest: false,
  },
] as const;

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
            <a href="#product">Product</a>
            <Link to="/login" className="nav-sign">
              Sign in
            </Link>
          </div>
          <div className="nav-right">
            <Link to="/signup" className="btn btn-dark nav-cta-desktop">
              Get started
              <span className="node">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </Link>
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
            <a href="#product" onClick={() => setMenuOpen(false)}>
              Product
            </a>
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-lime" onClick={() => setMenuOpen(false)}>
              Get started
              <span className="node">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </Link>
          </div>
        </div>
      )}

      <section className="mk-hero">
        <div className="mk-hero__media" style={{ backgroundImage: `url('${HERO}')` }} aria-hidden />
        <div className="mk-hero__shade" aria-hidden />
        <div className="mk-hero__grain" aria-hidden />
        <div className="container mk-hero__inner">
          <p className="mk-brand">{BRAND.name}</p>
          <div className="mk-hero__rule" aria-hidden />
          <h1>{BRAND.tagline}</h1>
          <p className="sub">{BRAND.promise}</p>
          <div className="jump">
            <Link to="/signup" className="btn btn-lime">
              Start free
              <span className="node">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </Link>
            <Link to="/login" className="btn btn-dark">
              Sign in
              <span className="node">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <div className="mk-slash" aria-hidden />

      <section id="how" className="mk-problem">
        <span className="mk-problem__big" aria-hidden>
          Loop
        </span>
        <div className="container mk-problem__grid">
          <Reveal>
            <p className="label dark">The problem</p>
            <h2>Commitments die in chat threads.</h2>
            <p className="body">
              Teams ship hard, then lose the plot — silent owners, overdue asks, escalations that arrive too late or too loud.
            </p>
          </Reveal>
          <Reveal delay={2} className="mk-problem__aside">
            <p>Loop is the autonomous chief of staff that keeps follow-through alive.</p>
            <ul className="tick-list">
              {["Extract & own every commitment", "Check in before silence calcifies", "Escalate with governance, not drama"].map(
                (t) => (
                  <li key={t}>
                    <span className="dot inline-flex items-center justify-center">
                      <Check className="h-3 w-3 text-[#0E1F1A]" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                )
              )}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="mk-flow">
        <div className="container">
          <Reveal>
            <p className="label">How it works</p>
            <h2>Four beats. One continuous loop.</h2>
          </Reveal>
          <div className="mk-rail">
            {FLOW.map((step, i) => (
              <Reveal key={step.n} delay={(Math.min(i + 1, 4) as 1 | 2 | 3 | 4)} className="mk-rail__step">
                <div className="mk-rail__disc">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
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
                <div className="mk-ribbon__index">{r.index}</div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </Reveal>
            </div>
            <div className="mk-ribbon__media">
              <img src={r.img} alt="" />
            </div>
          </section>
        ))}
      </div>

      <section className="mk-statement">
        <div className="container">
          <Reveal>
            <h2>
              Less chasing. <span className="lime">More closing.</span>
            </h2>
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
            <h2 className="max-w-[14ch] text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight text-[#0E1F1A]">
              Ready for an autonomous chief of staff?
            </h2>
            <div className="mt-8">
              <Link to="/signup" className="btn btn-dark">
                Create your workspace
                <span className="node">
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              </Link>
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
              <p className="mt-4 max-w-[32ch] text-sm leading-relaxed text-white/60">{BRAND.tagline}</p>
            </div>
            <div>
              <h4>Product</h4>
              <a href="#how">How it works</a>
              <a href="#product">Features</a>
              <Link to="/signup">Get started</Link>
            </div>
            <div>
              <h4>Workspace</h4>
              <Link to="/login">Sign in</Link>
              <Link to="/signup">Create account</Link>
            </div>
            <div>
              <h4>Trust</h4>
              <span className="block text-[14.5px] text-white/80">Governed escalations</span>
              <span className="block text-[14.5px] text-white/80">Sensitivity-aware</span>
            </div>
          </div>
          <div className="mk-footer__bottom">
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
            <span>Operational density. Calm trust.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

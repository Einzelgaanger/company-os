import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "@/components/brand/LoopMark";
import { BRAND } from "@/lib/brand";
import "@/styles/loop-marketing.css";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export function LegalPage({
  kicker,
  title,
  updated,
  intro,
  sections,
  other,
}: {
  kicker: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  other: { to: string; label: string };
}) {
  return (
    <div className="loop-site legal-site">
      <nav className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand brand--compact">
            <BrandMark className="h-9 w-9 sm:h-12 sm:w-12" />
            <span className="brand-word">{BRAND.name}</span>
          </Link>
          <div className="nav-links">
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms-of-service">Terms</Link>
            <Link to="/login" className="nav-sign">
              Sign in
            </Link>
          </div>
          <div className="nav-right">
            <Link to="/signup" className="btn btn-dark nav-cta-desktop">
              Get started
            </Link>
            <Link to="/" className="btn btn-dark" style={{ padding: "10px 16px" }}>
              Home
            </Link>
          </div>
        </div>
      </nav>

      <header className="legal-hero">
        <div className="container">
          <p className="label dark">{kicker}</p>
          <h1>{title}</h1>
          <p className="legal-hero__meta">Effective {updated} · {BRAND.name}</p>
          <p className="legal-hero__intro">{intro}</p>
        </div>
      </header>

      <div className="container legal-layout">
        <aside className="legal-toc" aria-label="On this page">
          <p>On this page</p>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
          <Link to={other.to} className="legal-toc__other">
            {other.label}
          </Link>
        </aside>

        <article className="legal-article">
          {sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>

      <footer className="mk-footer">
        <div className="container">
          <div className="mk-footer__bottom">
            <span>
              © {new Date().getFullYear()} {BRAND.name}
            </span>
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

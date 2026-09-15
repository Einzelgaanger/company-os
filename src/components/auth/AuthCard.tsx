import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { BrandMark } from "@/components/brand/LoopMark";
import { BRAND } from "@/lib/brand";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-card">
      <div className="auth-card__brand">
        <Link to="/" className="auth-card__lockup" aria-label={`${BRAND.name} home`}>
          <BrandMark className="h-9 w-9" />
          <span>
            <span className="auth-card__name">{BRAND.shortName}</span>
            <span className="auth-card__os">OS</span>
          </span>
        </Link>
        <Link to="/" className="auth-card__home">
          <Home className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Home
        </Link>
      </div>

      <div className="auth-card__head">
        <h2>{title}</h2>
        {description ? <p className="auth-card__desc">{description}</p> : null}
      </div>

      <div className="auth-card__body">{children}</div>
      {footer ? <div className="auth-card__footer">{footer}</div> : null}
    </div>
  );
}

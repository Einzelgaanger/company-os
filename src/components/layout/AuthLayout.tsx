import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

const AUTH_SHADE =
  "linear-gradient(105deg, rgba(8,18,15,0.94) 0%, rgba(14,31,26,0.82) 42%, rgba(14,31,26,0.4) 68%, rgba(14,31,26,0.62) 100%)";

/**
 * Auth layout — scrollable document (not fixed lock) so the on-screen
 * keyboard can push the focused field into view on mobile.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-[#0E1F1A]">
      <div className="pointer-events-none absolute inset-0 min-h-full" aria-hidden>
        <img
          src={BRAND.authHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0" style={{ background: AUTH_SHADE }} />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] flex-col lg:flex-row">
        <div className="flex shrink-0 flex-col justify-between p-5 safe-pad-x safe-pad-top text-white sm:p-6 lg:max-w-lg lg:flex-1 lg:p-10 xl:p-14">
          <Logo inverted />
          <div className="hidden space-y-4 lg:block">
            <p
              className="font-marketing text-xs font-semibold uppercase text-[#D3F36B]"
              style={{ letterSpacing: "0.16em" }}
            >
              {BRAND.name}
            </p>
            <h1 className="max-w-[11ch] text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-tight text-[#F3FAF5]">
              {BRAND.tagline}
            </h1>
            <p className="max-w-[38ch] text-[15px] font-medium leading-relaxed text-[rgba(243,250,245,0.78)]">
              {BRAND.promise}
            </p>
            <div className="h-[3px] w-[72px] origin-left bg-[#D3F36B]" aria-hidden />
          </div>
          <p className="mt-4 hidden text-[11px] text-white/60 lg:mt-0 lg:block">
            {BRAND.markExplain}
          </p>
        </div>

        <div className="flex flex-1 items-start justify-center px-4 py-6 safe-pad-x safe-pad-bottom sm:items-center sm:px-8 sm:py-10">
          <div className="w-full max-w-md animate-fade-in pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Optional auth launch delight (§11.3 / §33) — forest overlay, lime rocket.
 * Honors prefers-reduced-motion (skip immediately).
 */
export function AuthLaunch({ onDone }: { onDone: () => void }) {
  const [caption, setCaption] = useState("Ignite");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onDone();
      return;
    }
    const t1 = window.setTimeout(() => setCaption("Launch"), 900);
    const t2 = window.setTimeout(() => setCaption("Enter"), 1800);
    const t3 = window.setTimeout(onDone, 3400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#050a08" }}
      role="status"
      aria-live="polite"
    >
      <div className="auth-launch__rocket relative flex flex-col items-center">
        <Rocket
          className="h-16 w-16 text-[#D3F36B] auth-launch__ship"
          strokeWidth={1.75}
          style={{
            transform: "rotate(-45deg)",
            filter: "drop-shadow(0 0 18px rgba(211,243,107,0.85))",
          }}
        />
        <div className="auth-launch__flame" aria-hidden />
        <div className="auth-launch__smoke" aria-hidden />
      </div>
      <p className="mt-10 font-marketing text-sm font-semibold uppercase tracking-[0.22em] text-brand-accent">
        {caption}
      </p>
      <p className="mt-2 text-xs font-medium text-white/50">{BRAND.name}</p>
      <style>{`
        @keyframes authShake {
          0%, 100% { transform: translate(0, 0) rotate(-45deg); }
          20% { transform: translate(-2px, 1px) rotate(-46deg); }
          40% { transform: translate(2px, -1px) rotate(-44deg); }
          60% { transform: translate(-1px, 2px) rotate(-45deg); }
        }
        @keyframes authRise {
          0% { transform: translateY(0) rotate(-45deg); opacity: 1; }
          100% { transform: translateY(-120vh) rotate(-45deg); opacity: 0.4; }
        }
        @keyframes authFlame {
          0%, 100% { height: 28px; opacity: 0.9; }
          50% { height: 40px; opacity: 1; }
        }
        .auth-launch__ship {
          animation: authShake 0.35s ease-in-out 4, authRise 2s 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .auth-launch__flame {
          width: 10px;
          height: 28px;
          margin-top: -4px;
          border-radius: 0 0 999px 999px;
          background: linear-gradient(180deg, #fff, #f0c419 40%, #ff6b2c);
          animation: authFlame 0.2s ease-in-out infinite, authRise 2s 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .auth-launch__smoke {
          position: absolute;
          bottom: -40px;
          width: 80px;
          height: 40px;
          background: radial-gradient(ellipse, rgba(255,255,255,0.25), transparent 70%);
          opacity: 0.6;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-launch__ship, .auth-launch__flame { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

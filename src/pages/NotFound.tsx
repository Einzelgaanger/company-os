import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg text-center">
      <Logo />
      <h1 className="font-display text-3xl font-semibold text-ink">Page not found</h1>
      <p className="text-sm text-slate">This page doesn't exist or you don't have access to it.</p>
      <Button asChild>
        <Link to="/flow">Back to Flow</Link>
      </Button>
    </div>
  );
}

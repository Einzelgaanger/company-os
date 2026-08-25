import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-soft text-[#5A6B7D]",
        teal: "border-transparent bg-mint text-forest",
        amber: "border-transparent bg-gold-wash text-amber",
        red: "border-transparent bg-red-50 text-red-700",
        green: "border-transparent bg-mint text-[#1A3A2E]",
        outline: "border-[rgba(14,31,26,0.15)] bg-white text-[#5A6B7D]",
        lime: "border-transparent bg-lime/40 text-forest",
        gold: "border-transparent bg-gold-wash text-amber",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

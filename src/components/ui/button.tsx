import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Portal buttons — forest CTA (not lime). Lime = chips only. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(211,243,107,0.5)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          "rounded-2xl bg-[#0E1F1A] px-5 py-2.5 text-white hover:bg-[#1A3A2E] hover:shadow-md",
        destructive: "rounded-2xl bg-destructive px-5 py-2.5 text-white hover:bg-destructive/90",
        outline:
          "rounded-2xl border border-[rgba(14,31,26,0.1)] bg-[#F7FAF6] text-[#0E1F1A] hover:bg-[#F4FBE3]",
        secondary:
          "rounded-2xl border border-[rgba(14,31,26,0.1)] bg-[#F7FAF6] text-[#0E1F1A] hover:bg-[#F4FBE3]",
        ghost: "rounded-2xl text-[#0E1F1A] hover:bg-[#F7FAF6]",
        link: "rounded-md text-[#0E1F1A] underline-offset-4 hover:underline",
        chip: "rounded-md bg-[#D3F36B] px-2.5 py-1 text-xs font-bold text-[#0E1F1A] hover:bg-[#C5E85A]",
      },
      size: {
        default: "min-h-[40px]",
        sm: "min-h-[32px] rounded-xl px-3 text-xs",
        lg: "min-h-[48px] rounded-2xl px-6",
        icon: "h-9 w-9 rounded-xl px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

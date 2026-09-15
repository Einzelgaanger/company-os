import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function AuthField({
  id,
  label,
  icon,
  trailing,
  labelAside,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  /** e.g. “Forgot password?” — sits opposite the label */
  labelAside?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor={id} className="field-label mb-0">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="auth-field">
        <span className="auth-field__icon" aria-hidden>
          {icon}
        </span>
        <Input
          id={id}
          className={`input-glass auth-field__input pl-11${trailing ? " auth-field__input--toggle pr-11" : ""}`}
          {...props}
        />
        {trailing}
      </div>
    </div>
  );
}

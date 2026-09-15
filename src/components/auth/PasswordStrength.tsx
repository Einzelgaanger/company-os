import { useState } from "react";
import { Check, Eye, EyeOff, Lock } from "lucide-react";
import { AuthField } from "@/components/auth/AuthField";
import { checkPassword } from "@/lib/passwordStrength";

const RULES = [
  { key: "length", label: "At least 10 characters" },
  { key: "mixed", label: "Upper and lower case" },
  { key: "number", label: "A number" },
  { key: "symbol", label: "A symbol" },
] as const;

export function PasswordStrengthField({
  id = "password",
  label = "Password",
  value,
  onChange,
  autoComplete = "new-password",
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const check = checkPassword(value);

  return (
    <div>
      <AuthField
        id={id}
        label={label}
        icon={<Lock className="h-4 w-4" />}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        trailing={
          <button
            type="button"
            className="auth-field__toggle"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
      <div className="pw-meter" aria-live="polite">
        <div className="pw-meter__bars" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < check.score ? `is-${check.score}` : ""} />
          ))}
        </div>
        <p className={`pw-meter__label is-${check.score}`}>{value ? check.label : "Choose a strong password"}</p>
        <ul className="pw-meter__rules">
          {RULES.map((rule) => {
            const ok = check[rule.key];
            return (
              <li key={rule.key} className={ok ? "ok" : undefined}>
                <Check className="h-3 w-3" strokeWidth={3} />
                {rule.label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

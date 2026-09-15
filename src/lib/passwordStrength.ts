export type PasswordCheck = {
  length: boolean;
  mixed: boolean;
  number: boolean;
  symbol: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Strong";
  strong: boolean;
};

export function checkPassword(password: string): PasswordCheck {
  const length = password.length >= 10;
  const mixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const number = /\d/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const score = ([length, mixed, number, symbol].filter(Boolean).length) as PasswordCheck["score"];
  const label: PasswordCheck["label"] =
    score <= 1 ? "Too weak" : score === 2 ? "Weak" : score === 3 ? "Fair" : "Strong";
  return { length, mixed, number, symbol, score, label, strong: score === 4 };
}

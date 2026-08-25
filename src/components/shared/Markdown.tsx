import { Fragment } from "react";

function renderInline(text: string) {
  // Bold **...** only — enough for our report templates.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  );
}

/** Minimal markdown renderer for report bodies (headings, lists, bold). */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: JSX.Element[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="ml-5 list-disc space-y-1 text-sm text-slate">
          {list.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList(`l-${i}`);
      blocks.push(<h3 key={i} className="mt-4 font-display text-base font-semibold text-ink">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList(`l-${i}`);
      blocks.push(<h2 key={i} className="mt-2 font-display text-lg font-semibold text-ink">{line.slice(3)}</h2>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList(`l-${i}`);
    } else {
      flushList(`l-${i}`);
      blocks.push(<p key={i} className="text-sm text-slate">{renderInline(line)}</p>);
    }
  });
  flushList("l-final");

  return <div className="space-y-2">{blocks}</div>;
}

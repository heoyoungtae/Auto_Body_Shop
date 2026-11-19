// 표준서 본문(마크다운 일부: 문단·목록·표·굵게·코드) 보이기. 조항 번호·양식 번호는 눌러 갈 수 있게 한다.
import type { ReactNode } from "react";
import { StdText } from "../_std-text";

/** **굵게**, `코드` 와 조항 링크 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<StdText key={`${key}-t${i++}`} text={text.slice(last, at)} />);
    if (m[1] != null) out.push(<strong key={`${key}-b${i++}`}><StdText text={m[1]} /></strong>);
    else out.push(<code key={`${key}-c${i++}`} className="rounded bg-[var(--surface-2)] px-1 text-[0.9em]">{m[2]}</code>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(<StdText key={`${key}-t${i++}`} text={text.slice(last)} />);
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

type Block =
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "h"; text: string };

export function parseMd(md: string): Block[] {
  const lines = md.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^#{1,6} /.test(l)) {
      out.push({ t: "h", text: l.replace(/^#+ /, "") });
      i++;
      continue;
    }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      out.push({ t: "table", head: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    const ul = /^\s*[-*] (.*)$/;
    const ol = /^\s*\d+\. (.*)$/;
    if (ul.test(l) || ol.test(l)) {
      const kind = ul.test(l) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: string[] = [];
      while (i < lines.length && (re.test(lines[i]) || (lines[i].startsWith("  ") && lines[i].trim() && items.length))) {
        const m = re.exec(lines[i]);
        if (m) items.push(m[1]);
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      out.push({ t: kind, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*] |\d+\. |\||#)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    out.push({ t: "p", text: para.join(" ") });
  }
  return out;
}

export function StdMd({ body, id }: { body: string; id: string }) {
  const blocks = parseMd(body);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, n) => {
        const k = `${id}-${n}`;
        switch (b.t) {
          case "h":
            return (
              <p key={k} className="font-semibold">
                {inline(b.text, k)}
              </p>
            );
          case "p":
            return <p key={k}>{inline(b.text, k)}</p>;
          case "ul":
          case "ol": {
            const Tag = b.t;
            return (
              <Tag key={k} className={`${b.t === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5`}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={k} className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left font-medium">
                          {inline(h, `${k}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, x) => (
                          <td key={x} className="border border-[var(--line)] px-2 py-1 align-top">
                            {inline(c, `${k}-${j}-${x}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

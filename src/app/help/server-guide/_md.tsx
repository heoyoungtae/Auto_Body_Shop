// 서버 설명서 마크다운 보이기: 제목·문단·목록(들여쓴 하위 목록·코드 포함)·표·인용·코드 묶음, 굵게·코드·링크
import type { ReactNode } from "react";
import { CopyButton } from "../../money/bank/copy-button";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1] != null) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] != null) out.push(<code key={k} className="rounded bg-[var(--surface-2)] px-1 text-[0.9em] break-all">{m[2]}</code>);
    else {
      const href = m[4] ?? m[5];
      const ext = /^https?:/.test(href);
      out.push(
        <a key={k} href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})} className="text-[var(--accent)] underline break-all">
          {m[3] != null ? inline(m[3], k) : href}
        </a>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** 들여쓰기를 걷어 낸 줄들 */
const dedent = (ls: string[]) => {
  const n = Math.min(...ls.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return ls.map((l) => l.slice(Number.isFinite(n) ? n : 0));
};

export function GuideMd({ md, k = "m" }: { md: string; k?: string }): ReactNode {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const l = lines[i];
    const key = `${k}-${n++}`;
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(l)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const code = dedent(body).join("\n");
      out.push(
        <div key={key} className="relative">
          <pre className="overflow-x-auto rounded-md bg-[var(--surface-2)] p-3 pr-16 text-xs leading-relaxed">
            <code>{code}</code>
          </pre>
          <div className="absolute top-1.5 right-1.5">
            <CopyButton text={code} label="복사" />
          </div>
        </div>,
      );
      continue;
    }
    if (/^#{3,6} /.test(l)) {
      out.push(
        <h4 key={key} className="pt-1 text-sm font-semibold">
          {inline(l.replace(/^#+ /, ""), key)}
        </h4>,
      );
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*> ?/, ""));
      out.push(
        <div key={key} className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm leading-relaxed">
          {inline(q.join(" "), key)}
        </div>,
      );
      continue;
    }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head = [], ...body] = rows;
      out.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left">
                {head.map((c, j) => (
                  <th key={j} className="px-2 py-1 font-semibold">
                    {inline(c, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-[var(--line)] align-top">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1">
                      {inline(c, `${key}r${ri}${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const item = /^(\s*)([-*]|\d+\.) (.*)$/;
    if (item.test(l)) {
      const ind = item.exec(l)![1].length;
      const ordered = /\d/.test(item.exec(l)![2]);
      const items: string[][] = [];
      while (i < lines.length) {
        const m = item.exec(lines[i]);
        if (m && m[1].length === ind) {
          items.push([m[3]]);
          i++;
          continue;
        }
        // 항목 아래 들여쓴 줄(하위 목록·코드·이어지는 문장)과 그 사이 빈 줄
        if (items.length && (lines[i].startsWith(" ".repeat(ind + 2)) || (!lines[i].trim() && i + 1 < lines.length && lines[i + 1].startsWith(" ".repeat(ind + 2))))) {
          items[items.length - 1].push(lines[i]);
          i++;
          continue;
        }
        break;
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={key} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 text-sm leading-relaxed`}>
          {items.map(([first, ...rest], j) => {
            const sub = dedent(rest).join("\n");
            return (
              <li key={j}>
                {inline(first, `${key}i${j}`)}
                {sub.trim() && <div className="mt-1.5 space-y-2">{GuideMd({ md: sub, k: `${key}s${j}` })}</div>}
              </li>
            );
          })}
        </Tag>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*] |\d+\. |\||#|>|```)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    out.push(
      <p key={key} className="text-sm leading-relaxed">
        {inline(para.join(" "), key)}
      </p>,
    );
  }
  return <>{out}</>;
}

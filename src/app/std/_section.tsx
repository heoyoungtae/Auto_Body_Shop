// 표준서 절 하나: 번호·제목, 본문, 고친 표시·이전 판, 개정 요청·열람 제한
import Link from "next/link";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { roleText, sectionLabel, type StdRow } from "@/modules/quality/std";
import { FORM_SCREEN } from "@/modules/quality/std-ref";
import { AssistForm } from "../_assist";
import { CheckGroup } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, buttonClass } from "../_ui";
import { StdMd } from "./_md";
import { stdRolesAction } from "./actions";

export type ShownRow = StdRow & { hidden: boolean };

export const anchorOf = (s: Pick<StdRow, "key" | "part">) => {
  if (s.key === "p:intro") return "p-intro";
  if (s.part === "procedure") {
    const n = s.key.split(":")[2];
    return n ? `p-${n}` : "p";
  }
  if (s.part === "form") return s.key.slice(2);
  return `o-${s.key.slice(2)}`;
};

export function StdSection({ s, mgr, heading = "h3" }: { s: ShownRow; mgr: boolean; heading?: "h2" | "h3" }) {
  const H = heading;
  const screen = s.part === "form" ? FORM_SCREEN[s.no] : undefined;
  return (
    <section id={anchorOf(s)} className="scroll-mt-20 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <H className={heading === "h2" ? "text-lg font-bold" : "text-base font-bold"}>
          {s.no && s.part !== "form" ? <span className="mr-1.5 text-[var(--muted)]">{s.no}</span> : null}
          {s.part === "form" ? `${s.no} ${s.title}` : s.title}
        </H>
        {s.revisedOn && (
          <Badge tone="accent">
            {s.rev ?? ""} 고침 {s.revisedOn}
          </Badge>
        )}
        {s.roles.length > 0 && <Badge tone="warn">열람: {roleText(s.roles)}</Badge>}
        <span className="ml-auto flex flex-wrap gap-1.5 print:hidden">
          {screen && (
            <Link href={screen} className={buttonClass("secondary")}>
              앱 화면 열기
            </Link>
          )}
          {!s.hidden && (
            <Link href={`/approvals/new?sec=${encodeURIComponent(s.key)}`} className={buttonClass("secondary")} title="이 절의 본문을 고치자고 요청합니다(F-Q-05)">
              개정 요청
            </Link>
          )}
        </span>
      </div>
      {s.hidden ? (
        <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">이 절은 {roleText(s.roles)}만 볼 수 있습니다.</p>
      ) : s.body ? (
        <StdMd body={s.body} id={s.key} />
      ) : null}
      {!s.hidden && s.history.length > 0 && (
        <details className="mt-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
          <summary className="cursor-pointer text-[var(--muted)]">이전 판 {s.history.length}개 보기</summary>
          <div className="mt-2 space-y-4">
            {[...s.history].reverse().map((h, i) => (
              <div key={i} className="opacity-80">
                <p className="mb-1 text-xs text-[var(--muted)]">
                  <Badge tone="neutral">폐기</Badge> {h.rev ?? "처음 판"} · {h.until}까지{h.ref ? ` · ${h.ref}로 고침` : ""}
                </p>
                <StdMd body={h.body} id={`${s.key}-h${i}`} />
              </div>
            ))}
          </div>
        </details>
      )}
      {mgr && (
        <details className="mt-3 text-sm print:hidden">
          <summary className="cursor-pointer text-[var(--muted)]">열람 제한</summary>
          <AssistForm id={`std-roles-${s.key}`} action={stdRolesAction} className="mt-2 flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value={s.key} />
            <CheckGroup
              help="std.roles"
              name="roles"
              label={`${sectionLabel(s)} — 볼 수 있는 역할`}
              defaultChecked={s.roles}
              options={ROLES.filter((r) => r !== "owner").map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
            <SubmitButton variant="secondary">저장</SubmitButton>
          </AssistForm>
        </details>
      )}
    </section>
  );
}

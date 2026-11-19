import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getStdSection, stdToc } from "@/modules/quality/std";
import { FORM_SCREEN } from "@/modules/quality/std-ref";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, PageTitle } from "../../_ui";
import { StdMd } from "../_md";

/** 표준 양식집 목록: 양식 번호를 누르면 양식 모양, '앱 화면'을 누르면 그 양식을 쓰는 화면 */
export default async function StdForms() {
  const user = await requireUser();
  const db = await getDb();
  const [{ forms }, intro] = await Promise.all([stdToc(db), getStdSection(db, user, "f:intro").catch(() => null)]);
  const groups = new Map<string, typeof forms>();
  for (const f of forms) groups.set(f.grp ?? "기타", [...(groups.get(f.grp ?? "기타") ?? []), f]);
  return (
    <>
      <PageTitle
        help="std.forms"
        sub="양식마다 번호·판·근거 조항·보존 기간과 기입 항목, 작성 요령이 있습니다. 앱에서는 각 양식이 같은 항목의 입력 화면입니다."
        actions={
          <Link href="/std" className={buttonClass("secondary")}>
            차례
          </Link>
        }
      >
        표준 양식집
      </PageTitle>
      {intro?.body && (
        <Card>
          <StdMd body={intro.body} id="f-intro" />
        </Card>
      )}
      {[...groups].map(([g, list]) => (
        <Card key={g} title={g} help={{ kind: "panel", id: "std.forms" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-2 py-1.5">
                <Link href={`/std/form/${f.no}`} className="font-medium text-[var(--accent)]">
                  {f.no}
                </Link>
                <span>{f.title}</span>
                {f.revisedOn && <Badge tone="accent">고침 {f.revisedOn}</Badge>}
                {FORM_SCREEN[f.no] && (
                  <Link href={FORM_SCREEN[f.no]} className="ml-auto text-xs text-[var(--accent)]">
                    앱 화면 →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

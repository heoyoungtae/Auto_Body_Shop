import { PERM_KEYS, PERMS } from "@/modules/auth/permissions";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { requireUser } from "../../_lib/session";
import { Card, PageTitle } from "../../_ui";

/** 권한표: 업무 × 역할. 앱의 권한 검사가 이 표를 그대로 읽는다 */
export default async function PermissionsPage() {
  const user = await requireUser();
  const areas = [...new Set(PERM_KEYS.map((k) => PERMS[k].area))];
  return (
    <>
      <PageTitle help="settings.permissions" sub="업무마다 할 수 있는 역할입니다. 사내 표준서의 책임과 권한을 옮긴 것이며, 화면과 서버가 이 표대로 막습니다. 사람에게 주는 역할은 '직원·역할'에서 정합니다.">
        권한표
      </PageTitle>
      <div className="mt-4">
        <Card title="업무별 권한" help={{ kind: "panel", id: "perm.matrix" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">업무</th>
                  {ROLES.map((r) => (
                    <th key={r} className={`py-1.5 pr-2 text-center whitespace-nowrap ${user.roles.includes(r) ? "text-[var(--accent)]" : ""}`}>
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                  <th className="py-1.5 pr-2">근거·비고</th>
                </tr>
              </thead>
              {areas.map((a) => (
                <tbody key={a} className="divide-y divide-[var(--line)]">
                  <tr>
                    <td colSpan={ROLES.length + 2} className="pt-3 pb-1 text-xs font-semibold text-[var(--muted)]">
                      {a}
                    </td>
                  </tr>
                  {PERM_KEYS.filter((k) => PERMS[k].area === a).map((k) => {
                    const p = PERMS[k];
                    return (
                      <tr key={k}>
                        <td className="py-1.5 pr-2">{p.label}</td>
                        {ROLES.map((r) => (
                          <td key={r} className="py-1.5 pr-2 text-center" aria-label={(p.roles as string[]).includes(r) ? "가능" : "불가"}>
                            {(p.roles as string[]).includes(r) ? <b className="text-[var(--ok)]">●</b> : <span className="text-[var(--muted)]">·</span>}
                          </td>
                        ))}
                        <td className="py-1.5 pr-2 text-xs text-[var(--muted)]">
                          {p.std}
                          {"note" in p && p.note ? ` · ${p.note}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">모든 직원은 자기 근태 신청, 재직증명서 신청, 내 서명·비밀번호, 결재함을 씁니다. 결재 승인자는 전결 규정이 정합니다. 내 역할은 파란 글씨입니다.</p>
        </Card>
      </div>
    </>
  );
}

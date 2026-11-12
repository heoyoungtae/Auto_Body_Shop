// 직원 서류함 카드(근로자 명부 화면 오른쪽): 이력서·자격증 사본 등. 대표·회계 담당과 본인만 보인다
import type { Db } from "@/db/client";
import type { CurrentUser } from "@/modules/auth/service";
import { can } from "@/modules/auth/permissions";
import { listStaffFiles, purgeOn, STAFF_FILE_KINDS, type StaffFileKind } from "@/modules/staff/files";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { SelectField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, Card, fmtTime } from "../_ui";
import { EvidenceFiles } from "../money/evidence-files";
import { ShowWhen } from "../consults/show-when";
import { staffFileAction } from "./actions";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export async function StaffFilesCard({ db, user, userId, licenses, leftOn }: { db: Db; user: CurrentUser; userId: string; licenses: string[]; leftOn?: string | null }) {
  const rows = await listStaffFiles(db, user, userId);
  const roster = can(user, "staff.roster");
  const today = seoulDate();
  const purge = purgeOn(leftOn);
  const noCopy = licenses.filter((n) => !rows.some((r) => r.f.kind === "license" && r.f.licenseName === n));
  return (
    <div id="files">
      <Card title={`직원 서류함 ${rows.length}건`} help={{ kind: "panel", id: "staff.files" }}>
        {purge && (
          <p className={`mb-2 rounded-md px-3 py-2 text-sm ${purge <= today ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface-2)]"}`}>
            퇴직 {leftOn} · 보존 기한 {purge}
            {purge <= today ? " — 기한이 지났습니다. 서류를 지워(파기) 주세요" : "까지 보관합니다"}
          </p>
        )}
        {noCopy.length > 0 && <p className="mb-2 text-xs text-[var(--warn)]">명부의 자격증 중 사본이 없는 것: {noCopy.join(", ")}</p>}
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {rows.map(({ f, by }) => (
              <li key={f.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{STAFF_FILE_KINDS[f.kind as StaffFileKind] ?? f.kind}</Badge>
                  <a href={`/api/staff-files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                    {f.title}
                  </a>
                  {!f.checkedAt && <Badge tone="warn">확인 전</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {f.fileName} · {kb(f.size)} · {by ?? "-"} {fmtTime(f.createdAt)}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {roster && !f.checkedAt && (
                    <form action={staffFileAction}>
                      <input type="hidden" name="userId" value={userId} />
                      <input type="hidden" name="op" value="check" />
                      <input type="hidden" name="fileId" value={f.id} />
                      <SubmitButton variant="secondary">확인</SubmitButton>
                    </form>
                  )}
                  {(roster || (f.uploadedBy === user.id && !f.checkedAt)) && (
                    <details>
                      <summary className="cursor-pointer text-xs text-[var(--danger)]">지우기</summary>
                      <AssistForm id={`sf-rm-${f.id}`} action={staffFileAction} className="mt-1 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="userId" value={userId} />
                        <input type="hidden" name="op" value="remove" />
                        <input type="hidden" name="fileId" value={f.id} />
                        <TextField help="staff.fileRemoveReason" name="reason" required defaultValue={purge && purge <= today ? "보존 기간 지나 파기" : ""} suggestions={[{ value: "잘못 올림" }, { value: "새 파일로 바꿈" }, { value: "보존 기간 지나 파기" }]} />
                        <SubmitButton variant="danger">지우기</SubmitButton>
                      </AssistForm>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">올린 서류가 없습니다.</p>
        )}
        <details className="mt-3" open={!rows.length}>
          <summary className="cursor-pointer text-sm text-[var(--accent)]">서류 올리기</summary>
          <AssistForm id={`sf-add-${userId}`} action={staffFileAction} className="mt-2 space-y-3" guard={false}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="op" value="add" />
            <ShowWhen
              field="kind"
              initial={noCopy.length ? "license" : "resume"}
              cases={licenses.length ? { license: <SelectField help="staff.fileLicense" name="licenseName" defaultValue={noCopy[0] ?? ""} placeholder="명부에 없는 자격증" options={licenses.map((n) => ({ value: n, label: n }))} from="근로자 명부" /> } : {}}
            >
              <SelectField help="staff.fileKind" name="kind" required defaultValue={noCopy.length ? "license" : "resume"} options={Object.entries(STAFF_FILE_KINDS).map(([value, label]) => ({ value, label }))} />
            </ShowWhen>
            <TextField help="staff.fileTitle" name="title" />
            <EvidenceFiles help="staff.files" name="staffFiles" pickLabel="+ 사진·PDF 고르기" />
            <p className="text-xs text-[var(--warn)]">주민등록번호가 보이는 사본은 뒷자리를 가리고 올려 주세요. 올린 파일은 암호화해 보관하고 대표·회계 담당과 본인만 봅니다.</p>
            <SubmitButton variant="secondary">올리기</SubmitButton>
          </AssistForm>
        </details>
      </Card>
    </div>
  );
}

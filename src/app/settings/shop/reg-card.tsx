// 사업자등록증: 파일 올리기 카드, 등록증 칸(종류·생년월일/법인등록번호·업태·종목 등), 국세청 확인 결과 줄
import { REG_KINDS, type BizReg, type NtsCheck } from "@/modules/platform/biz-reg";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, RadioRow, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, Card, fmtTime } from "../../_ui";
import { ShowWhen } from "../../consults/show-when";
import { EvidenceFiles } from "../../money/evidence-files";
import { uploadRegFileAction } from "./actions";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export function RegFileCard({ reg, owner, canOpen }: { reg: BizReg; owner: boolean; canOpen: boolean }) {
  const [now, ...old] = reg.files;
  return (
    <Card title="사업자등록증" help={{ kind: "panel", id: "shop.reg" }}>
      <div className="space-y-3 text-sm">
        {now ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">지금 등록증</Badge>
            {canOpen ? (
              <a href="/api/bizreg-file/0" target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                {now.fileName}
              </a>
            ) : (
              <span>{now.fileName}</span>
            )}
            <span className="text-xs text-[var(--muted)]">
              {kb(now.size)} · {fmtTime(new Date(now.at))}에 올림
            </span>
          </div>
        ) : (
          <p className="text-[var(--muted)]">아직 올린 등록증이 없습니다. 홈택스에서 내려받은 PDF나 등록증 사진을 올려 두면 거래처가 사본을 달라고 할 때 바로 보낼 수 있습니다.</p>
        )}
        {old.length > 0 && canOpen && (
          <details>
            <summary className="cursor-pointer text-xs text-[var(--muted)]">예전 등록증 {old.length}개(정정 이력)</summary>
            <ul className="mt-1 space-y-0.5 text-xs">
              {old.map((f, i) => (
                <li key={f.path}>
                  <a href={`/api/bizreg-file/${i + 1}`} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                    {f.fileName}
                  </a>{" "}
                  · {fmtTime(new Date(f.at))}
                </li>
              ))}
            </ul>
          </details>
        )}
        {owner ? (
          <details open={!now}>
            <summary className="cursor-pointer text-[var(--accent)]">{now ? "새 등록증으로 바꾸기(정정·재발급)" : "등록증 올리기"}</summary>
            <AssistForm id="shop-regfile" action={uploadRegFileAction} guard={false} className="mt-2 space-y-2">
              <EvidenceFiles help="reg.file" name="regFile" pickLabel="+ 등록증 PDF·사진 고르기" multiple={false} />
              <SubmitButton variant="secondary">올리기</SubmitButton>
            </AssistForm>
          </details>
        ) : (
          <p className="text-xs text-[var(--muted)]">등록증 올리기는 대표만, 열어 보기는 대표·회계 담당만 할 수 있습니다.</p>
        )}
        <p className="text-xs text-[var(--muted)]">파일은 암호화해 보관합니다. 올린 뒤 아래 &lsquo;등록증 내용&rsquo;을 등록증에 적힌 순서대로 넣고 &lsquo;저장하고 국세청에서 확인&rsquo;을 누르면 번호·대표자·개업일이 맞는지 보고 과세 유형을 채웁니다.</p>
      </div>
    </Card>
  );
}

export function NtsLine({ nts }: { nts: NtsCheck }) {
  const bad = nts.valid === false || nts.statusCd === "02" || nts.statusCd === "03";
  const tone = nts.valid == null ? "bg-[var(--surface-2)]" : bad ? "border border-[var(--warn)] bg-[var(--warn-soft)]" : "bg-[var(--ok-soft)]";
  return (
    <p className={`mb-3 rounded-md px-3 py-2 text-sm ${tone}`}>
      <b>국세청 확인</b> {fmtTime(new Date(nts.at))}: {nts.message}
      {nts.statusCd === "03" && nts.endDt ? ` (폐업일 ${nts.endDt})` : ""}
    </p>
  );
}

/** 등록증 종류 + 종류에 따라 생년월일(개인) 또는 법인등록번호·본점 주소(법인) */
export function RegFields({ reg, kindGuess, corpRegNo }: { reg: BizReg; kindGuess: string; corpRegNo: string }) {
  const kind = reg.kind || kindGuess;
  const personal = <DateField help="reg.birth" name="birth" defaultValue={reg.birth} quick={[]} />;
  return (
    <ShowWhen
      field="regKind"
      initial={kind}
      cases={{
        general: personal,
        simple: personal,
        exempt: personal,
        corporate: (
          <div className="grid gap-4 md:grid-cols-2">
            <TextField help="tax.corpRegNo" name="corpRegNo" inputMode="numeric" defaultValue={corpRegNo} />
            <TextField help="reg.hqAddress" name="hqAddress" defaultValue={reg.hqAddress} />
          </div>
        ),
      }}
    >
      <RadioRow
        help="reg.kind"
        name="regKind"
        defaultValue={kind}
        options={Object.entries(REG_KINDS).map(([value, label]) => ({ value, label }))}
        from={!reg.kind && kindGuess ? "사업자등록번호" : reg.nts?.valid && reg.kind ? "국세청" : undefined}
      />
    </ShowWhen>
  );
}

const BIZ_TYPES = ["서비스업", "도매 및 소매업", "제조업"];
const BIZ_ITEMS = ["자동차 전문 수리업", "자동차 종합 수리업", "자동차 세차업", "자동차 부품 및 내장품 판매업"];

export function RegMoreFields({ reg }: { reg: BizReg }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField help="reg.bizType" name="bizType" defaultValue={reg.bizType} suggestions={BIZ_TYPES.map((value) => ({ value }))} />
        <TextField help="reg.bizItem" name="bizItem" defaultValue={reg.bizItem} suggestions={BIZ_ITEMS.map((value) => ({ value }))} />
        <TextField help="reg.coOwners" name="coOwners" defaultValue={reg.coOwners} />
        <CheckGroup help="reg.unitTax" name="unitTax" options={[{ value: "1", label: "적용 사업자(여)" }]} defaultChecked={reg.unitTax ? ["1"] : []} />
        <TextField help="reg.invoiceEmail" name="invoiceEmail" type="email" inputMode="email" autoComplete="off" defaultValue={reg.invoiceEmail} />
        <DateField help="reg.issuedOn" name="issuedOn" defaultValue={reg.issuedOn} quick={["today"]} />
        <TextField help="reg.taxOffice" name="taxOffice" defaultValue={reg.taxOffice} suggestions={["부평세무서", "남인천세무서", "북인천세무서", "서인천세무서", "인천세무서", "연수세무서"].map((value) => ({ value }))} />
      </div>
    </>
  );
}

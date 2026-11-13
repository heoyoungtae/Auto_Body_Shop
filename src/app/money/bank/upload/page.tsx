import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { bankImport } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { accountLabel } from "@/modules/bank/rules";
import { loadFeed, recentImports } from "@/modules/bank/service";
import { FILE_KINDS } from "@/modules/bank/sheet-map";
import { AssistForm } from "../../../_assist";
import { SelectField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { importAction, undoImportAction } from "../actions";
import { SheetFile } from "../sheet-file";

const KIND_LABEL: Record<string, string> = { ...FILE_KINDS, tax_sale: "세금계산서", tax_buy: "세금계산서" };

/** 은행·카드사·홈택스 엑셀/CSV 올리기 */
export default async function BankUploadPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; done?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "bank.view")) return <p className="text-sm text-[var(--muted)]">통장·카드 내역은 회계 담당·대표가 올립니다.</p>;
  const db = await getDb();
  const cfg = await loadFeed(db);
  const imports = await recentImports(db);
  const [done] = q.done ? await db.select().from(bankImport).where(eq(bankImport.id, q.done)) : [];
  const accName = new Map(cfg.accounts.map((a) => [a.id, accountLabel(a)]));
  return (
    <>
      <PageTitle
        help="bank.upload"
        sub="인터넷뱅킹·카드사·홈택스에서 받은 엑셀(xlsx·xls)·CSV 를 그대로 올립니다. 열 이름은 앱이 알아보고, 이미 들어온 거래(문자로 받은 것 포함)는 건너뜁니다. 주 1회와 월 마감 전에 올리세요."
        actions={
          <>
            <Link href="/money/bank" className={buttonClass("secondary")}>
              통장·카드 내역
            </Link>
            <Link href="/money/bank/guide#upload" className={buttonClass("secondary")}>
              어디서 받나요?
            </Link>
          </>
        }
      >
        엑셀 올리기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {done && (
        <div className="mb-4 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm">
          <p className="font-medium">
            {done.fileName} · {KIND_LABEL[done.fileKind] ?? done.fileKind}
            {done.accountId ? ` · ${accName.get(done.accountId) ?? ""}` : ""} · {done.firstOn ?? "-"} ~ {done.lastOn ?? "-"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">알아본 열: {done.columns}</p>
          <p className="mt-1">
            <Link href="/money/bank?f=todo" className="font-semibold text-[var(--accent)]">
              맞출 것 보러 가기 →
            </Link>
          </p>
        </div>
      )}
      <Card title="파일 올리기" help={{ kind: "panel", id: "bank.uploadForm" }}>
        <AssistForm id="bank-upload" action={importAction} className="grid gap-3 md:grid-cols-2" guard={false}>
          <SelectField help="bank.fileKind" name="kind" required defaultValue="auto" options={Object.entries(FILE_KINDS).map(([value, label]) => ({ value, label }))} />
          <SelectField
            help="bank.account"
            name="accountId"
            placeholder={cfg.accounts.length > 1 ? "파일에서 짐작(못 하면 다시 물음)" : "하나뿐이면 저절로"}
            options={cfg.accounts.map((a) => ({ value: a.id, label: `${a.kind === "bank" ? "통장" : "카드"} · ${accountLabel(a)}` }))}
          />
          <div className="md:col-span-2">
            <SheetFile />
          </div>
          <p className="text-xs text-[var(--muted)] md:col-span-2">
            기간이 겹쳐도 됩니다. 같은 거래는 한 번만 들어갑니다. 공동인증서·비밀번호는 앱에 넣지 않습니다. PDF·화면 캡처는 읽지 못합니다.
          </p>
          <div className="md:col-span-2">
            <SubmitButton>올리기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
      <div className="mt-4">
        <Card title="최근 올린 파일" help={{ kind: "panel", id: "bank.imports" }}>
          {imports.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {imports.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-xs text-[var(--muted)]">{fmtTime(i.at)}</span>
                  <span className="font-medium">{i.fileName}</span>
                  <Badge>{KIND_LABEL[i.fileKind] ?? i.fileKind}</Badge>
                  {i.accountId && <span className="text-xs">{accName.get(i.accountId) ?? "(지운 계좌)"}</span>}
                  <span className="text-xs text-[var(--muted)]">
                    {i.firstOn ?? "-"}~{i.lastOn ?? "-"} · 새로 {i.added} · 이미 있던 {i.dup} · 건너뜀 {i.skipped}
                  </span>
                  {i.undoneAt ? (
                    <Badge tone="neutral">되돌림</Badge>
                  ) : (
                    <form action={undoImportAction} className="ml-auto">
                      <input type="hidden" name="importId" value={i.id} />
                      <button className="text-xs text-[var(--danger)] underline">되돌리기</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 올린 파일이 없습니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

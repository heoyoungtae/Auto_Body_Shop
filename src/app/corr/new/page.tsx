import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { letterPrefill, partySuggestions } from "@/modules/quality/corr";
import { loadShopInfo } from "@/modules/platform/shop";
import { AssistForm } from "../../_assist";
import { TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, PageTitle } from "../../_ui";
import { draftLetterAction } from "../actions";
import { PartyFields } from "../party-fields";

/** 회사 공문 쓰기(F-Q-12): 받은 문서에서 '회신 쓰기'로 오면 상대·제목·관련 문서번호를 불러온다. 대표 승인 뒤 직인을 찍어 보낸다 */
export default async function NewLetterPage({ searchParams }: { searchParams: Promise<{ error?: string; reply?: string; copy?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [hints, pre, shop] = await Promise.all([partySuggestions(db), letterPrefill(db, user, { reply: q.reply, copy: q.copy }), loadShopInfo(db)]);
  const missing = !shop.name || !shop.ceo || !shop.sealPath;
  return (
    <>
      <PageTitle
        help="corr.new"
        std="F-Q-12"
        sub="회사 이름으로 밖에 보내는 문서입니다. 문서번호·날짜·발신 명의·직인은 앱이 넣으니 받는 곳·제목·본문만 적습니다. 올리면 대표가 승인하고, 승인되면 인쇄·PDF로 보낸 뒤 발송을 기록합니다."
        actions={
          <Link href="/corr" className={buttonClass("secondary")}>
            대장으로
          </Link>
        }
      >
        {pre?.replyToId ? "회신 공문 쓰기" : "공문 쓰기"}
      </PageTitle>
      <ErrorBox message={q.error} />
      {missing && <p className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">공문에 찍을 상호·대표자·직인이 공업사 정보에 다 있어야 합니다. &lsquo;설정 › 공업사 정보&rsquo;에서 채우세요.</p>}
      {!can(user, "corr.write") ? (
        <ErrorBox message="공문 쓰기 권한이 없습니다" />
      ) : (
        <Card title="공문 내용" help={{ kind: "panel", id: "corr.letterForm" }}>
          <AssistForm id={`corr-new-${pre?.replyToId || "x"}`} action={draftLetterAction} className="grid gap-3 md:grid-cols-2" guard={false}>
            <input type="hidden" name="replyToId" value={pre?.replyToId ?? ""} />
            <PartyFields hints={hints} dir="out" party={pre?.party} kind={pre?.partyKind ?? "other"} addr={pre?.partyAddr} from={pre?.from} />
            <TextField help="corr.cc" name="cc" defaultValue={pre?.cc ?? ""} />
            <div className="md:col-span-2">
              <TextField help="corr.titleOut" name="title" required defaultValue={pre?.title ?? ""} from={pre?.from} />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="corr.letterBody" name="body" required rows={10} defaultValue={pre?.body ?? ""} from={pre?.from} />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="corr.enclosures" name="enclosures" rows={3} defaultValue={pre?.enclosures ?? ""} />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>{user.roles.includes("owner") ? "승인하고 문서번호 받기" : "대표에게 올리기(결재)"}</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}

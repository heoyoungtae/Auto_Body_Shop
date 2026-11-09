import Link from "next/link";
import { NC_SOURCES, isNcSource } from "@/modules/quality/rules";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { openNcAction } from "../actions";

/** 부적합 발행. 다른 화면에서 열면 출처·관련 건이 채워져 온다(?source=&refType=&refId=&refLabel=) */
export default async function NewNcPage({ searchParams }: { searchParams: Promise<{ source?: string; refType?: string; refId?: string; refLabel?: string; error?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const from = q.refLabel ? "앞 화면" : undefined;
  return (
    <>
      <PageTitle
        help="nc.new"
        sub="누구나 발행합니다. 발행하면 품질 담당·공장장에게 알림이 가고, 원인 분석과 시정 조치는 그분들이 정합니다."
        actions={
          <Link href="/nc" className="text-sm text-[var(--accent)]">
            ← 부적합 목록
          </Link>
        }
      >
        부적합 발행
      </PageTitle>
      <ErrorBox message={q.error} />
      <Card title="발생 내용" help={{ kind: "panel", id: "nc.new" }}>
        <AssistForm id="nc-new" action={openNcAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="refType" value={q.refType ?? ""} />
          <input type="hidden" name="refId" value={q.refId ?? ""} />
          <SelectField help="nc.source" name="source" required defaultValue={q.source && isNcSource(q.source) ? q.source : ""} from={q.source ? from : undefined} placeholder="고르세요" options={Object.entries(NC_SOURCES).map(([value, label]) => ({ value, label }))} />
          <TextField help="nc.refLabel" name="refLabel" defaultValue={q.refLabel ?? ""} from={from} />
          <div className="md:col-span-2">
            <TextAreaField help="nc.content" name="content" required rows={3} />
          </div>
          <div className="md:col-span-2">
            <TextAreaField help="nc.immediate" name="immediate" rows={2} />
          </div>
          <RadioRow help="nc.major" name="major" required defaultValue="0" options={[
            { value: "0", label: "일반" },
            { value: "1", label: "중대(대표 승인)", tone: "danger" },
          ]} />
          <div className="md:col-span-2">
            <SubmitButton>발행</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}

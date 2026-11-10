import Link from "next/link";
import { FIVE_S_ZONES } from "@/modules/quality/rules";
import { INC_KIND, INC_SEVERITY, PROCESSES } from "@/modules/safety/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import {
  DateField,
  RadioRow,
  SelectField,
  TextAreaField,
  TextField,
} from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { reportIncidentAction } from "../actions";

/** 사고·아차사고 보고(F-09-03): 누구나. 보고자를 탓하지 않는다 */
export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kind?: string }>;
}) {
  const q = await searchParams;
  await requireUser();
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return (
    <>
      <PageTitle
        help="incidents.new"
        sub="다쳤거나 다칠 뻔한 일을 바로 적습니다. 아차사고 보고는 탓하려는 것이 아니라 같은 일이 진짜 사고가 되지 않게 하려는 것입니다. 화재·중상은 119가 먼저입니다."
        actions={
          <Link href="/incidents" className="text-sm text-[var(--accent)]">
            ← 사고·아차사고
          </Link>
        }
      >
        사고·아차사고 보고
      </PageTitle>
      <ErrorBox message={q.error} />
      <Card title="보고(F-09-03)" help={{ kind: "panel", id: "inc.report" }}>
        <AssistForm
          id="incident-new"
          action={reportIncidentAction}
          className="grid gap-3 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <RadioRow
              help="inc.kind"
              name="kind"
              required
              defaultValue={
                q.kind === "near"
                  ? "near"
                  : q.kind === "accident"
                    ? "accident"
                    : undefined
              }
              options={[
                { value: "accident", label: INC_KIND.accident, tone: "danger" },
                {
                  value: "near",
                  label: `${INC_KIND.near}(다칠 뻔함)`,
                  tone: "warn",
                },
              ]}
            />
          </div>
          <DateField
            help="inc.occurredOn"
            name="occurredOn"
            required
            defaultValue={seoulDate(now)}
            quick={["today"]}
          />
          <TextField
            help="inc.occurredTime"
            name="occurredTime"
            type="time"
            required
            defaultValue={time}
          />
          <TextField
            help="inc.place"
            name="place"
            required
            suggestions={Object.entries(FIVE_S_ZONES).map(([k, v]) => ({
              value: `${k} ${v}`,
            }))}
          />
          <SelectField
            help="inc.process"
            name="process"
            placeholder="공정 고르기"
            options={PROCESSES.map((p) => ({ value: p, label: p }))}
          />
          <div className="md:col-span-2">
            <TextAreaField
              help="inc.description"
              name="description"
              required
              rows={3}
            />
          </div>
          <div className="md:col-span-2">
            <RadioRow
              help="inc.severity"
              name="severity"
              required
              defaultValue="none"
              options={Object.entries(INC_SEVERITY).map(([value, label]) => ({
                value,
                label,
                tone:
                  value === "none"
                    ? ("ok" as const)
                    : value === "first_aid"
                      ? ("warn" as const)
                      : ("danger" as const),
              }))}
            />
          </div>
          <TextField help="inc.injured" name="injured" />
          <TextField help="inc.injury" name="injury" />
          <TextField help="inc.damage" name="damage" />
          <TextField help="inc.immediate" name="immediate" />
          <div className="md:col-span-2">
            <SubmitButton>보고</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}

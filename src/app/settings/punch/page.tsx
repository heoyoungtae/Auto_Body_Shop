import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPunchConfig } from "@/modules/staff/punch";
import { normalizeIp } from "@/modules/staff/punch-rules";
import { PlaceCard } from "../../attendance/punch-panels";
import { requestMeta, requireUser } from "../../_lib/session";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";

/** 출퇴근 장소(정비소 와이파이의 공인 IP). 대표 지시 2026-11-12: 출퇴근 화면이 아니라 설정에 둔다 */
export default async function PunchSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const [cfg, meta] = await Promise.all([owner ? loadPunchConfig(await getDb()) : Promise.resolve(null), requestMeta()]);
  return (
    <>
      <PageTitle help="settings.punch" std="STD-11 4절" sub="정비소 와이파이에 연결한 기기에서만 출근·퇴근을 누를 수 있게 정비소 인터넷 주소(공인 IP)를 넣습니다.">
        출퇴근 장소(와이파이)
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      {cfg ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <PlaceCard ips={cfg.ips} myIp={normalizeIp(meta.ip)} />
          <Card title="확인하는 법" help={{ kind: "panel", id: "punch.today" }}>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>정비소 와이파이에 연결한 휴대폰이나 사무실 PC로 이 화면을 엽니다.</li>
              <li>&lsquo;지금 이 기기의 주소&rsquo;가 칸에 들어 있으면 그대로 저장합니다.</li>
              <li>
                휴대폰 데이터(LTE·5G)로 바꾸고 <Link href="/attendance" className="text-[var(--accent)] hover:underline">출퇴근·근태</Link>를 열어 출근 단추가 막히는지 봅니다.
              </li>
            </ol>
          </Card>
        </div>
      ) : (
        <Notice>정비소 인터넷 주소는 대표만 보고 바꿉니다. 출근 단추가 막히면 대표에게 알려 주세요.</Notice>
      )}
    </>
  );
}

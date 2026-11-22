// TV 현황판 값(30초마다 화면이 다시 부른다). 로그인한 직원이거나, 주소의 비밀 열쇠(?k=)가 맞아야 준다.
// p=techbay 는 테크베이용 현황판(테크베이 고객 차만). 테크베이용 열쇠로는 이 값만 받는다.
import { getDb } from "@/db/runtime";
import { isTechbayToken, tvBoard, tvScope, tvTokenOk } from "@/modules/dashboard/tv";
import { noteTvIp } from "@/modules/staff/punch";
import { currentUser, requestMeta } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await getDb();
  const q = new URL(req.url).searchParams;
  const k = q.get("k");
  const kind = q.get("p") === "techbay" ? "techbay" : "all";
  const user = k ? null : await currentUser();
  const ok = k ? await tvTokenOk(db, k, kind) : !!user && !user.mustChangePassword;
  if (!ok) return Response.json({ ok: false, message: k ? "TV 링크가 맞지 않습니다. 설정 › TV 현황판에서 새 링크로 다시 띄워 주세요." : "로그인이 필요합니다" }, { status: 401 });
  // TV 링크로 띄운 현황판(공업사 TV)의 주소를 공업사 인터넷 주소로 따라간다(출퇴근 장소 'TV 현황판과 같은 인터넷')
  // 지점·작업장 TV 면 그 지점의 인터넷 주소로 기억한다(지점마다 출퇴근 장소가 따로)
  // 테크베이용 열쇠의 TV는 공업사 밖(테크베이 사무실)에 있을 수 있어 기억하지 않는다
  const scope = kind === "techbay" ? { branchId: null, workplaceId: null, portal: "techbay" as const, label: null } : await tvScope(db, { b: q.get("b"), w: q.get("w") });
  if (k && !(await isTechbayToken(db, k))) await noteTvIp(db, (await requestMeta()).ip, Date.now(), scope.branchId).catch(() => undefined);
  return Response.json({ ok: true, data: await tvBoard(db, new Date(), scope) }, { headers: { "cache-control": "no-store" } });
}

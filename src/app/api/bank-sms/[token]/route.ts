// 통장·카드 알림 문자 받는 주소. 대표 휴대폰의 문자 전달 앱(안드로이드)·단축어(아이폰)가 문자 내용을 보낸다.
// 주소 끝의 비밀 열쇠가 맞아야 받는다(설정 › 통장·카드 연동에서 만들고, 새로 만들면 예전 주소는 막힌다).
// 받는 꼴: JSON({"text": "..."} · message · msg · body · content · sms 아무 이름) · 폼(text=...) · 그냥 글자.
import { getDb } from "@/db/runtime";
import { ingestSms, notifyFeedIssues, tokenOk } from "@/modules/bank/service";
import { pickSmsText as pickText, SMS_TEXT_KEYS as TEXT_KEYS } from "@/modules/bank/sms-parse";

export const dynamic = "force-dynamic";

async function handle(req: Request, token: string) {
  const db = await getDb();
  if (!(await tokenOk(db, token))) return Response.json({ ok: false, message: "주소가 맞지 않습니다(설정에서 새로 만든 주소인지 확인)" }, { status: 401 });
  const raw = (await req.text()).slice(0, 20_000);
  const type = req.headers.get("content-type") ?? "";
  let text: string | null = null;
  if (type.includes("json") || /^\s*[{[]/.test(raw)) {
    try {
      text = pickText(JSON.parse(raw));
    } catch {
      text = raw;
    }
  } else if (type.includes("x-www-form-urlencoded")) {
    const f = new URLSearchParams(raw);
    text = TEXT_KEYS.map((k) => f.get(k)).find((x) => x?.trim()) ?? null;
  } else text = raw;
  if (!text?.trim()) {
    const q = new URL(req.url).searchParams;
    text = TEXT_KEYS.map((k) => q.get(k)).find((x) => x?.trim()) ?? null;
  }
  if (!text?.trim()) return Response.json({ ok: false, message: "문자 내용(text)이 비었습니다" }, { status: 400 });
  const r = await ingestSms(db, text);
  await notifyFeedIssues(db, r);
  return Response.json({ ok: true, ...r });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, (await params).token);
}

/** 일부 전달 앱은 GET(주소?text=...)만 된다 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!new URL(req.url).searchParams.get("text")) {
    const db = await getDb();
    return (await tokenOk(db, token)) ? Response.json({ ok: true, message: "연결됨. 문자 전달 앱 설정이 맞습니다" }) : Response.json({ ok: false, message: "주소가 맞지 않습니다" }, { status: 401 });
  }
  return handle(req, token);
}

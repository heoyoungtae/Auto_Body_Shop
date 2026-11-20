// 통장·카드 알림 문자 받는 주소. 대표 휴대폰의 문자 전달 앱(안드로이드)·단축어(아이폰)가 문자 내용을 보낸다.
// 주소 끝의 비밀 열쇠가 맞아야 받는다(설정 › 통장·카드 연동에서 만들고, 새로 만들면 예전 주소는 막힌다).
// 받는 꼴: JSON · 폼(urlencoded·multipart) · 주소 뒤 ?text= · 그냥 글자. 이름은 text·message·msg·body·content·sms 등,
// 모르는 이름이면 은행 문자처럼 보이는 값(없으면 가장 긴 값)을 쓴다. 전달 앱마다 꼴이 달라서(대표 2026-11-20: 앱은 '성공'인데 안 들어옴).
// 내용을 못 찾은 요청도 '받은 기록'에 꼴(종류·이름)만 남겨 어디서 막혔는지 보이게 한다.
import { getDb } from "@/db/runtime";
import { ingestSms, noteEmptyRequest, noteRejected, notifyFeedIssues, tokenOk } from "@/modules/bank/service";
import { pickSmsText, SMS_TEXT_KEYS as TEXT_KEYS } from "@/modules/bank/sms-parse";

export const dynamic = "force-dynamic";

type Field = [string, string];

/** JSON 안의 모든 글자 값(이름과 함께) */
function jsonFields(v: unknown, key = "", out: Field[] = [], depth = 0): Field[] {
  if (typeof v === "string") out.push([key, v]);
  else if (v && typeof v === "object" && depth < 4) for (const [k, x] of Object.entries(v as Record<string, unknown>)) jsonFields(x, Array.isArray(v) ? key : k, out, depth + 1);
  return out;
}

/** 이름이 아는 것이면 그것, 아니면 은행 문자처럼 보이는 값, 그것도 없으면 가장 긴 값 */
export function chooseText(fields: Field[]): string | null {
  const vals = fields.filter(([, v]) => v.trim());
  for (const k of TEXT_KEYS) {
    const hit = vals.find(([n]) => n.toLowerCase() === k.toLowerCase());
    if (hit) return hit[1];
  }
  const bankish = vals.filter(([, v]) => /(입금|출금|승인|취소|잔액)/.test(v) && /\d/.test(v));
  const pool = bankish.length ? bankish : vals;
  return pool.sort((a, b) => b[1].length - a[1].length)[0]?.[1] ?? null;
}

async function handle(req: Request, token: string) {
  const db = await getDb();
  if (!(await tokenOk(db, token))) {
    await noteRejected(db, token);
    return Response.json({ ok: false, message: "주소가 맞지 않습니다(설정에서 새로 만든 주소인지 확인)" }, { status: 401 });
  }
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  const url = new URL(req.url);
  const fields: Field[] = [];
  let raw = "";
  if (type.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === "string") fields.push([k, v]);
    } catch {
      /* 깨진 폼 */
    }
  } else {
    raw = req.method === "GET" ? "" : (await req.text()).slice(0, 20_000);
    if (raw && (type.includes("json") || /^\s*[{["]/.test(raw))) {
      try {
        const j = JSON.parse(raw) as unknown;
        const known = pickSmsText(j);
        fields.push(...jsonFields(j));
        if (known && !fields.length) fields.push(["text", known]);
      } catch {
        fields.push(["", raw]);
      }
    } else if (raw && (type.includes("x-www-form-urlencoded") || /^[\w.-]+=[^\s]*(&[\w.-]+=[^\s]*)*$/.test(raw.trim()))) {
      for (const [k, v] of new URLSearchParams(raw)) fields.push([k, v]);
    } else if (raw) fields.push(["", raw]);
  }
  let text = chooseText(fields);
  if (!text?.trim()) text = chooseText([...url.searchParams.entries()]);
  if (!text?.trim()) {
    const names = [...fields.map(([k]) => k), ...url.searchParams.keys()].filter(Boolean);
    await noteEmptyRequest(db, `${req.method} ${type || "형식 없음"}${names.length ? ` · 이름 ${names.slice(0, 6).join(",")}` : " · 내용 없음"}`);
    return Response.json({ ok: false, message: "문자 내용(text)이 비었습니다" }, { status: 400 });
  }
  const r = await ingestSms(db, text);
  await notifyFeedIssues(db, r);
  return Response.json({ ok: true, ...r });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, (await params).token);
}
export const PUT = POST;

/** 일부 전달 앱은 GET(주소?text=...)만 된다. 내용 없이 열면 '연결됨'만 답한다(브라우저로 연결 확인) */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = new URL(req.url).searchParams;
  if (![...q.values()].some((v) => v.trim())) {
    const db = await getDb();
    if (!(await tokenOk(db, token))) return Response.json({ ok: false, message: "주소가 맞지 않습니다" }, { status: 401 });
    // 전달 앱이 문자 내용 없이 GET 만 보내도 '성공'으로 보이므로 기록에 남긴다(브라우저로 연 연결 확인도 여기)
    await noteEmptyRequest(db, "GET 주소만 열림(문자 내용 없음) — 브라우저 연결 확인이면 괜찮음, 전달 앱이면 보내는 방식을 POST 로");
    return Response.json({ ok: true, message: "연결됨. 문자 전달 앱 설정이 맞습니다" });
  }
  return handle(req, token);
}

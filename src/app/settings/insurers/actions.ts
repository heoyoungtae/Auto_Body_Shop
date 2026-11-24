"use server";
// 보험사 목록 저장·AOS 사용 켜고 끄기
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveInsurer, setAosEnabled } from "@/modules/repair/insurers";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

/** 담당자 칸: 한 줄에 한 명, '이름, 역할, 전화, 메일'(쉼표로 나눔). 전화·메일은 모양으로 알아본다 */
function parseContacts(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[,，]/).map((x) => x.trim()).filter(Boolean))
    .filter((p) => p.length)
    .map(([name, ...rest]) => {
      const phone = rest.find((x) => /^[\d\-\s()+]{7,}$/.test(x));
      const email = rest.find((x) => x.includes("@"));
      const role = rest.find((x) => x !== phone && x !== email);
      return { name, role, phone, email };
    });
}

export async function insurerAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("id");
  const back = `/settings/insurers${id ? `?id=${id}` : ""}`;
  let msg = "";
  try {
    const db = await getDb();
    if (s("intent") === "aos") {
      const on = s("enabled") === "1";
      await setAosEnabled(db, user, on);
      msg = on ? "AOS 씀을 켰습니다. 보험 청구 화면에 'AOS 진행' 칸이 생깁니다" : "AOS 씀을 껐습니다. AOS 칸과 할 일이 보이지 않습니다";
    } else {
      const rate = s("rateWon").replace(/[^\d]/g, "");
      await saveInsurer(db, user, {
        id: id || undefined,
        name: s("name"),
        kind: s("kind"),
        rateWon: rate ? Number(rate) : null,
        partsDiscount: s("partsDiscount"),
        note: s("note"),
        active: form.getAll("active").includes("1"),
        contacts: parseContacts(s("contacts")),
      });
      msg = id ? "보험사 정보를 고쳤습니다" : "보험사를 목록에 더했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl("/settings/insurers", msg));
}

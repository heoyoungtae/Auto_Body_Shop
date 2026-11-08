"use client";
// 저장 전 점검: 서버가 막을 경우를 적는 동안 미리 알려 준다(사용자 지시 2026-11-08 "저장되지 않는 경우는 노트 또는 경고로").
// 서버 검사(src/modules/customer/service.ts)와 같은 규칙. 항목을 누르면 그 칸으로 간다.
import { useEffect, useRef, useState } from "react";
import { normalizePlate, PHONE_RE, PLATE_RE } from "@/modules/customer/rules";
import { normalizeVin, VIN_RE } from "@/modules/customer/vehicles";

type Issue = { field: string; msg: string };

function check(form: HTMLFormElement, fullDates: string[]): Issue[] {
  const fd = new FormData(form);
  const has = (k: string) => form.elements.namedItem(k) != null;
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const all = (k: string) => fd.getAll(k).map(String);
  const out: Issue[] = [];
  if (has("newName") && !v("newName")) out.push({ field: "newName", msg: "고객명이 비어 있습니다" });
  if (has("newPhone") && !PHONE_RE.test(v("newPhone").replace(/\D/g, ""))) out.push({ field: "newPhone", msg: "연락처가 비었거나 형식이 맞지 않습니다(예: 010-1234-5678)" });
  if (has("consentMethod") && v("consentMethod") !== "link" && !all("consent").includes("required"))
    out.push({ field: "consentMethod", msg: "개인정보 필수 동의가 체크되지 않았습니다. 동의를 받아 체크하거나, 동의 받은 방법을 '문자·알림톡으로 동의 요청'으로 바꾸세요" });
  if (has("plateNo") && v("plateNo") && !PLATE_RE.test(normalizePlate(v("plateNo")))) out.push({ field: "plateNo", msg: "차량번호 형식이 맞지 않습니다(예: 12가3456)" });
  if (has("vin") && v("vin") && !VIN_RE.test(normalizeVin(v("vin")))) out.push({ field: "vin", msg: "차대번호는 영문·숫자 17자리입니다(I·O·Q 없음)" });
  const y = v("year");
  if (has("year") && y && !/^(19[89]\d|20\d\d)$/.test(y)) out.push({ field: "year", msg: "연식은 네 자리 연도로 적습니다(예: 2021)" });
  if (!all("damageTypes").length && !v("damageParts")) out.push({ field: "damageTypes", msg: "손상 유형이나 부위를 하나 이상 적어야 합니다" });
  const num = (k: string) => (v(k) ? Number(v(k).replace(/[^\d]/g, "")) : null);
  const lo = num("estMin");
  const hi = num("estMax");
  if ((lo != null || hi != null) && !all("estNoticed").includes("1")) out.push({ field: "estNoticed", msg: "예상 금액을 적었으면 '실차 진단 후 확정됨을 안내함'에 체크해야 합니다" });
  if (lo != null && hi != null && lo > hi) out.push({ field: "estMin", msg: "예상 금액 최소가 최대보다 큽니다" });
  const ins = v("insurance");
  if (ins && ins !== "self" && !v("insurer")) out.push({ field: "insurer", msg: "보험 건은 보험사를 적어야 합니다" });
  const r = v("result");
  if (r === "reserved") {
    if (!v("reservedDate")) out.push({ field: "reservedDate", msg: "입고 예약일을 골라야 합니다" });
    else if (fullDates.includes(v("reservedDate")) && !all("overCapacityOk").includes("1")) out.push({ field: "overCapacityOk", msg: `${v("reservedDate")}은(는) 입고 한도가 찼습니다. 공장장 동의를 받고 체크하거나 다른 날을 고르세요` });
    if (ins && ins !== "self" && !v("claimNo")) out.push({ field: "claimNo", msg: "보험 건은 예약 전에 사고접수번호를 받아 적어야 합니다" });
  }
  if (r === "declined" && !v("closeReason")) out.push({ field: "closeReason", msg: "거절·보류 사유를 적어야 합니다" });
  return out;
}

export function SaveCheck({ fullDates = [] }: { fullDates?: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      clearTimeout(t);
      t = setTimeout(() => setIssues(check(form, fullDates)), 150);
    };
    run();
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    form.addEventListener("assist:restored", run);
    return () => {
      form.removeEventListener("input", run);
      form.removeEventListener("change", run);
      form.removeEventListener("assist:restored", run);
    };
  }, [fullDates]);
  const go = (name: string) => {
    const el = box.current?.closest("form")?.querySelector<HTMLElement>(`[name="${name}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };
  return (
    <div ref={box} role="status" aria-live="polite">
      {issues.length ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-sm">
          <p className="font-semibold text-[var(--warn)]">이대로는 저장되지 않습니다({issues.length}건). 누르면 그 칸으로 갑니다.</p>
          <ul className="mt-1.5 space-y-1">
            {issues.map((i) => (
              <li key={i.field + i.msg}>
                <button type="button" onClick={() => go(i.field)} className="text-left underline-offset-2 hover:underline">
                  ⚠ {i.msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--line)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">저장할 수 있습니다.</p>
      )}
    </div>
  );
}

// 목록 공통 조회줄(보고서 센터 2단계, 사용자 결정 2026-11-13): 모든 대장·전표 목록에 같은 기간·기준 날짜·찾기·합계·쪽 넘김·엑셀.
// 목록마다 ListDef 하나(어느 날짜로 거를지, 무엇으로 찾을지, 무엇을 더할지)만 적으면 화면·엑셀이 같은 결과를 쓴다.
// 상태 탭(진행 중·전체 등)은 화면마다 지금처럼 두고, 이 조회줄은 그 위에 기간·찾기를 겹친다.
import type { Db } from "@/db/client";
import type { Role } from "@/modules/auth/roles";
import { periodOf, isIsoDate } from "@/modules/report/period";
import { addDays, seoulDate } from "@/modules/platform/time";

export type Who = { id: string; name?: string; roles: Role[] };
export type Q = Record<string, string | undefined>;

export const PRESETS = {
  all: "전체",
  today: "오늘",
  week: "이번 주",
  month: "이번 달",
  lastmonth: "지난 달",
  year: "올해",
  custom: "직접 지정",
} as const;
export type Preset = keyof typeof PRESETS;
const isPreset = (s: unknown): s is Preset => typeof s === "string" && s in PRESETS;

export const PAGE_SIZE = 50;

type DateLike = string | Date | null | undefined;
export type ListCol<R> = {
  label: string;
  get: (r: R) => string | number | null | undefined;
  /** 합계 줄에 더함(숫자 칸) */
  sum?: boolean;
  unit?: "원" | "건" | "개" | "시간" | "kg" | "L" | "점" | "명" | "일";
};

export type ListDef<R> = {
  key: string;
  title: string;
  /** 화면 주소(상태 탭 등 다른 조건은 q 로 넘어감) */
  href: string;
  allowed: (u: Who) => boolean;
  /** 거르기 전 전체 줄. q = 화면 주소의 조건(상태 탭 f 등) */
  load: (db: Db, u: Who, q: Q, lq: LQ) => Promise<R[]>;
  /** 기간을 어느 날짜로 거를지(첫째가 기본) */
  dates: { key: string; label: string; get: (r: R) => DateLike }[];
  /** 찾기 칸이 뒤지는 글자들. 없으면 load 가 q.s 로 직접 찾는다(전화 끝 4자리 등) */
  text?: (r: R) => (string | number | null | undefined)[];
  /** 엑셀 칸(합계 줄은 sum 칸) */
  cols: ListCol<R>[];
  /** 주소에 남겨 엑셀·쪽 넘김에 그대로 넘길 다른 조건 이름(상태 탭 등) */
  keep?: string[];
  /** 찾기 칸 안내(예: 이름·전화 끝 4자리·차량번호) */
  searchHint?: string;
  /** 기본 기간(없으면 전체) */
  preset?: Preset;
  /** 상태 탭(주소 이름 param, 첫째가 기본). 화면 단추·엑셀 조건 줄에 쓴다 */
  tabs?: { param: string; options: readonly { v: string; label: string }[] };
};

/** 지금 고른 상태 탭 값(잘못된 값이면 첫째) */
export function tabOf<R>(def: ListDef<R>, q: Q): string | undefined {
  const t = def.tabs;
  if (!t) return undefined;
  return t.options.some((o) => o.v === q[t.param]) ? q[t.param] : t.options[0]?.v;
}

export type LQ = { preset: Preset; from: string | null; to: string | null; dateKey: string; s: string; page: number };

/** 날짜 값 → 'YYYY-MM-DD'(서울) */
export function isoOf(v: DateLike): string | null {
  if (!v) return null;
  if (v instanceof Date) return seoulDate(v);
  return v.length >= 10 ? v.slice(0, 10) : null;
}

/** 주소 조건 → 조회 조건(잘못된 값은 기본값으로) */
export function parseLQ<R>(q: Q, def: ListDef<R>, today = seoulDate()): LQ {
  const preset: Preset = isPreset(q.p) ? q.p : (def.preset ?? "all");
  const dateKey = def.dates.some((d) => d.key === q.dk) ? q.dk! : (def.dates[0]?.key ?? "");
  const s = (q.s ?? "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(10000, Number.parseInt(q.pg ?? "1", 10) || 1));
  let from: string | null = null;
  let to: string | null = null;
  switch (preset) {
    case "today":
      from = to = today;
      break;
    case "week":
    case "month":
    case "year": {
      const p = periodOf(preset, today);
      from = p.from;
      to = p.to;
      break;
    }
    case "lastmonth": {
      const p = periodOf("month", addDays(periodOf("month", today).from, -1));
      from = p.from;
      to = p.to;
      break;
    }
    case "custom": {
      const a = q.from && isIsoDate(q.from) ? q.from : null;
      const b = q.to && isIsoDate(q.to) ? q.to : null;
      from = a && b && a > b ? b : a;
      to = a && b && a > b ? a : b;
      break;
    }
  }
  return { preset, from, to, dateKey, s, page };
}

export type ListResult<R> = {
  def: ListDef<R>;
  lq: LQ;
  /** 이 쪽에 보일 줄 */
  rows: R[];
  /** 조건에 맞는 모든 줄(엑셀) */
  all: R[];
  count: number;
  /** 거르기 전 줄 수 */
  loaded: number;
  pages: number;
  totals: { label: string; value: number; unit?: string }[];
  /** 지금 조건 그대로의 주소 조각(?…) — 쪽 번호 제외 */
  qs: (over?: Record<string, string | number | null>) => string;
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

/** 줄 거르기·합계·쪽 나눔 */
export function applyLQ<R>(def: ListDef<R>, rows: R[], lq: LQ, q: Q = {}): ListResult<R> {
  const dt = def.dates.find((d) => d.key === lq.dateKey);
  const needle = lq.s ? norm(lq.s) : "";
  const all = rows.filter((r) => {
    if (dt && (lq.from || lq.to)) {
      const d = isoOf(dt.get(r));
      if (!d) return false;
      if (lq.from && d < lq.from) return false;
      if (lq.to && d > lq.to) return false;
    }
    if (needle && def.text && !def.text(r).some((t) => t != null && norm(String(t)).includes(needle))) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(lq.page, pages);
  const totals = def.cols
    .filter((c) => c.sum)
    .map((c) => ({ label: c.label, unit: c.unit, value: all.reduce((a, r) => a + (Number(c.get(r)) || 0), 0) }));
  const base: Record<string, string> = {};
  for (const k of def.keep ?? []) if (q[k]) base[k] = q[k]!;
  if (def.tabs && q[def.tabs.param] && q[def.tabs.param] !== def.tabs.options[0]?.v) base[def.tabs.param] = tabOf(def, q)!;
  if (lq.preset !== (def.preset ?? "all")) base.p = lq.preset;
  if (lq.preset === "custom") {
    if (lq.from) base.from = lq.from;
    if (lq.to) base.to = lq.to;
  }
  if (def.dates.length > 1 && lq.dateKey !== def.dates[0].key) base.dk = lq.dateKey;
  if (lq.s) base.s = lq.s;
  const qs = (over: Record<string, string | number | null> = {}) => {
    const m = new Map(Object.entries(base));
    for (const [k, v] of Object.entries(over)) v == null || v === "" ? m.delete(k) : m.set(k, String(v));
    const u = new URLSearchParams([...m.entries()]).toString();
    return u ? `?${u}` : "";
  };
  return { def, lq: { ...lq, page }, rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), all, count: all.length, loaded: rows.length, pages, totals, qs };
}

export class ListAccessError extends Error {}

/** 목록 하나 실행(권한 → 불러오기 → 거르기) */
export async function runList<R>(db: Db, def: ListDef<R>, u: Who, q: Q, today = seoulDate()): Promise<ListResult<R>> {
  if (!def.allowed(u)) throw new ListAccessError("이 목록을 볼 권한이 없습니다");
  const lq = parseLQ(q, def, today);
  const rows = await def.load(db, u, q, lq);
  return applyLQ(def, rows, lq, q);
}

/** 엑셀(CSV, BOM): 제목·조건 줄 → 머리줄 → 줄 → 합계 */
export function listCsv<R>(r: ListResult<R>, q: Q = {}) {
  const tv = tabOf(r.def, q);
  const f = tv ? r.def.tabs!.options.find((o) => o.v === tv)?.label : undefined;
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const dt = r.def.dates.find((d) => d.key === r.lq.dateKey);
  const cond = [
    r.lq.from || r.lq.to ? `${dt?.label ?? "날짜"} ${r.lq.from ?? "처음"} ~ ${r.lq.to ?? "끝"}` : "기간 전체",
    f ? `보기: ${f}` : "",
    r.lq.s ? `찾기: ${r.lq.s}` : "",
    `${r.count}건`,
  ].filter(Boolean);
  const lines: unknown[][] = [[r.def.title, ...cond], [], r.def.cols.map((c) => (c.unit && c.sum ? `${c.label}(${c.unit})` : c.label))];
  for (const row of r.all) lines.push(r.def.cols.map((c) => c.get(row)));
  if (r.totals.length) lines.push(r.def.cols.map((c, i) => (i === 0 ? "합계" : c.sum ? r.totals.find((t) => t.label === c.label)?.value : "")));
  return "﻿" + lines.map((l) => l.map(esc).join(",")).join("\r\n") + "\r\n";
}

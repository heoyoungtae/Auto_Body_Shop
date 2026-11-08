// 사내 역할 — 사내 표준서 0장·앱 설계서 2.2. 이름은 표준서와 같게 쓴다.
import { ROLE_VALUES } from "@/db/schema/platform";

export type Role = (typeof ROLE_VALUES)[number];
export const ROLES = ROLE_VALUES;

export const ROLE_LABEL: Record<Role, string> = {
  owner: "대표",
  plant_manager: "공장장",
  advisor: "상담원",
  technician: "기술자",
  quality: "품질 담당",
  safety: "안전환경 담당",
  accounting: "회계 담당",
};

export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

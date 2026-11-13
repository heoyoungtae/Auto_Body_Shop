// 직무기술서(F-11-08) 규칙: 권한표에서 자동으로 만드는 '앱에서 하는 일', 명부 직무 찾기, 계약서 업무 내용, 채용 공고
import { describe, expect, it } from "vitest";
import { PERMS } from "@/modules/auth/permissions";
import { ROLES } from "@/modules/auth/roles";
import { concurrentJobs, contractDuties, JOB_KEYS, JOBS, jobByTitle, jobPosting, permsForRole, ROSTER_JOBS } from "@/modules/staff/job-rules";
import { SKILLS } from "@/modules/staff/rules";

describe("직무기술서", () => {
  it("모든 앱 역할에 직무기술서가 있고, 칸이 비지 않는다", () => {
    for (const r of ROLES) expect(JOB_KEYS.some((k) => JOBS[k].role === r), r).toBe(true);
    for (const k of JOB_KEYS) {
      const j = JOBS[k];
      expect(j.purpose.length, k).toBeGreaterThan(10);
      expect(j.duties.length, k).toBeGreaterThan(2);
      expect(j.required.length, k).toBeGreaterThan(0);
      expect(j.checks.length, k).toBeGreaterThan(0);
      for (const s of [...(j.skills ?? []), ...(j.sideSkills ?? [])]) expect(SKILLS[s], `${k} ${s}`).toBeTruthy();
    }
  });

  it("기술자는 3개 직군, 품질·안전환경은 겸직이라 명부에서 고르지 않는다", () => {
    expect(JOB_KEYS.filter((k) => JOBS[k].role === "technician")).toHaveLength(3);
    expect(ROSTER_JOBS).not.toContain("quality");
    expect(ROSTER_JOBS).not.toContain("safety");
    expect(ROSTER_JOBS).not.toContain("owner");
    expect(concurrentJobs(["plant_manager", "quality"], "plant_manager")).toEqual(["quality"]);
  });

  it("'앱에서 하는 일'은 권한표 그대로다", () => {
    const tech = permsForRole("technician").map((p) => p.key);
    expect(tech).toContain("work.do");
    expect(tech).not.toContain("estimate.review");
    expect(tech.length).toBe(Object.values(PERMS).filter((p) => (p.roles as string[]).includes("technician")).length);
    expect(permsForRole("accounting").find((p) => p.key === "supplier.bank")?.alone).toBe(true);
  });

  it("명부의 직무 이름으로 찾고, 계약서 업무 내용은 80자 안", () => {
    expect(jobByTitle("기술자(도장)")).toBe("tech_paint");
    expect(jobByTitle("판금 기술자")).toBeNull();
    for (const k of JOB_KEYS) {
      const d = contractDuties(JOBS[k].title);
      expect(d.length, k).toBeLessThanOrEqual(80);
      expect(d.startsWith(JOBS[k].title)).toBe(true);
    }
    expect(contractDuties("예전 값")).toBe("예전 값");
  });

  it("채용 공고 문구에 자격·우대가 들어가고 나이·성별 조건은 없다", () => {
    const t = jobPosting("tech_sheet", "테스트 정비소");
    expect(t).toContain("[테스트 정비소] 기술자(판금·덴트) 채용");
    expect(t).toContain("자동차차체수리기능사");
    expect(t).not.toMatch(/나이|성별|남성|여성|세 이하/);
  });
});

import { describe, expect, it } from "vitest";
import { FIELD_HELP } from "@/modules/help/fields";
import { fieldTraits, shapeBizNo, shapeNumList, shapePhone } from "@/app/_field-traits";

describe("칸 성격", () => {
  it("전화번호 칸은 전화 키패드와 하이픈 자동", () => {
    for (const k of ["cust.phone", "staff.phone", "sup.phone", "claim.adjusterPhone", "sms.sender"] as const) {
      const t = fieldTraits(k, FIELD_HELP[k]);
      expect(t.attrs.inputMode, k).toBe("tel");
      expect(t.shape, k).toBe("phone");
    }
  });
  it("사업자번호·연도·도막 두께는 숫자 키패드", () => {
    expect(fieldTraits("sup.bizNo", FIELD_HELP["sup.bizNo"]).attrs.inputMode).toBe("numeric");
    expect(fieldTraits("veh.year", FIELD_HELP["veh.year"]).attrs.inputMode).toBe("numeric");
    expect(fieldTraits("qc.filmUm", FIELD_HELP["qc.filmUm"]).attrs.inputMode).toBe("decimal");
  });
  it("메일·아이디는 영문 배열(메일 키패드), 자동 대문자 끔", () => {
    expect(fieldTraits("sup.email", FIELD_HELP["sup.email"]).attrs).toMatchObject({ type: "email", autoCapitalize: "none" });
    expect(fieldTraits("login.loginId", FIELD_HELP["login.loginId"]).attrs).toMatchObject({ inputMode: "email", autoCapitalize: "none" });
  });
  it("차대번호는 대문자로, 칸은 내용에 맞는 폭", () => {
    const t = fieldTraits("veh.vin", FIELD_HELP["veh.vin"]);
    expect(t.shape).toBe("upper");
    expect(t.maxWidth).toBe("17em");
    expect(fieldTraits("veh.plate", FIELD_HELP["veh.plate"]).maxWidth).toBe("10em");
  });
  it("긴 글 칸은 폭을 다 쓴다", () => {
    expect(fieldTraits("claim.scopeNote", FIELD_HELP["claim.scopeNote"]).maxWidth).toBeUndefined();
  });
});

describe("넣는 동안 형식", () => {
  it("전화번호", () => {
    expect(shapePhone("01012345678")).toBe("010-1234-5678");
    expect(shapePhone("0212345678")).toBe("02-1234-5678");
    expect(shapePhone("021234567")).toBe("02-123-4567");
    expect(shapePhone("0311234567")).toBe("031-123-4567");
    expect(shapePhone("15886474")).toBe("1588-6474");
    expect(shapePhone("0801234567")).toBe("080-123-4567");
    expect(shapePhone("010")).toBe("010");
  });
  it("사업자번호", () => {
    expect(shapeBizNo("1234567890")).toBe("123-45-67890");
    expect(shapeBizNo("1234")).toBe("123-4");
  });
  it("숫자 여러 개: 점·띄어쓰기를 쉼표로", () => {
    expect(shapeNumList("112.118 109")).toBe("112, 118, 109");
    expect(shapeNumList("112.")).toBe("112, ");
    expect(shapeNumList("112, 118")).toBe("112, 118");
  });
});

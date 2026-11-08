import { describe, expect, it } from "vitest";
import { KAKAO_KEYS, KAKAO_TEMPLATES, renderKakao, SAMPLE_VARS } from "@/modules/messaging/kakao";
import { adBlockedAt, adWrap, MOBILE_RE, smsBytes, smsKind } from "@/modules/messaging/rules";

describe("문자 규칙", () => {
  it("한글은 2바이트, 영문·숫자는 1바이트로 센다", () => {
    expect(smsBytes("abc")).toBe(3);
    expect(smsBytes("가나")).toBe(4);
  });
  it("90바이트까지 SMS, 넘으면 LMS", () => {
    expect(smsKind("가".repeat(45))).toBe("SMS");
    expect(smsKind("가".repeat(46))).toBe("LMS");
  });
  it("광고 문자는 오후 9시~오전 8시(한국 시각)에 막힌다", () => {
    expect(adBlockedAt(new Date("2026-11-08T12:00:00Z"))).toBe(true); // 21:00 KST
    expect(adBlockedAt(new Date("2026-11-08T11:59:00Z"))).toBe(false); // 20:59
    expect(adBlockedAt(new Date("2026-11-07T22:59:00Z"))).toBe(true); // 07:59
    expect(adBlockedAt(new Date("2026-11-07T23:00:00Z"))).toBe(false); // 08:00
  });
  it("광고 문자는 (광고)로 시작하고 무료수신거부 번호로 끝난다", () => {
    const t = adWrap("세차 할인", "080-123-4567");
    expect(t.startsWith("(광고)")).toBe(true);
    expect(t.endsWith("무료수신거부 080-123-4567")).toBe(true);
  });
  it("휴대폰 번호 형식", () => {
    expect(MOBILE_RE.test("01012345678")).toBe(true);
    expect(MOBILE_RE.test("0212345678")).toBe(false);
  });
});

describe("알림톡 템플릿", () => {
  it("보기 값으로 모든 변수가 채워진다", () => {
    for (const k of KAKAO_KEYS) {
      for (const v of KAKAO_TEMPLATES[k].vars) expect(SAMPLE_VARS[v], `${k}: ${v}`).toBeDefined();
      expect(renderKakao(k, SAMPLE_VARS)).not.toMatch(/#\{/);
    }
  });
  it("광고 문구가 섞이지 않는다", () => {
    for (const k of KAKAO_KEYS) expect(KAKAO_TEMPLATES[k].text).not.toMatch(/할인|이벤트|\(광고\)/);
  });
});

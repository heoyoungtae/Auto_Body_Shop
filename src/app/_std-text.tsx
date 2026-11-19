// 글 속 조항 번호(STD-02 5절, 총람 Q.6, F-02-01, 부록 B …)를 눌러 앱 안 사내 표준서로 가게 한다(2026-11-19).
import Link from "next/link";
import { linkifyStd } from "@/modules/quality/std-ref";

export function StdText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const segs = linkifyStd(text);
  if (segs.length === 1 && !segs[0].href) return <>{text}</>;
  return (
    <>
      {segs.map((s, i) =>
        s.href ? (
          <Link key={i} href={s.href} onClick={onNavigate} className="text-[var(--accent)] underline decoration-dotted underline-offset-2" title="사내 표준서에서 보기">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

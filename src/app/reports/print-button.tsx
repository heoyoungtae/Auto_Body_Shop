"use client";
import { Button } from "../_ui";

export function PrintButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Button variant={variant} onClick={() => window.print()}>
      인쇄
    </Button>
  );
}

/**
 * PDF 저장: 인쇄 창을 열고 파일 이름을 보고서 이름·기간으로 맞춘다.
 * 인쇄 창의 '대상(프린터)'에서 'PDF로 저장'을 고르면 PDF 파일이 된다(크롬·엣지·사파리·휴대폰 모두 기본 제공).
 * 서버에서 PDF를 만들지 않아 화면과 똑같은 모양이 나온다.
 */
export function PdfButton({ fileName }: { fileName: string }) {
  return (
    <Button
      variant="secondary"
      title="인쇄 창의 대상에서 'PDF로 저장'을 고르세요"
      onClick={() => {
        const old = document.title;
        document.title = fileName;
        const back = () => {
          document.title = old;
          window.removeEventListener("afterprint", back);
        };
        window.addEventListener("afterprint", back);
        window.print();
      }}
    >
      PDF 저장
    </Button>
  );
}

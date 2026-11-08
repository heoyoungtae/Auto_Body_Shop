// 서류의 '(서명 또는 인)' 자리. 발급 때 고정한 직인·서명 그림이 있으면 글자 위에 겹쳐 찍는다.
export function SignMark({ path, kind = "sign" }: { path?: string | null; kind?: "sign" | "seal" }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="text-neutral-500">(서명 또는 인)</span>
      {path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${path}`}
          alt={kind === "seal" ? "직인" : "서명"}
          className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-multiply ${kind === "seal" ? "h-12 w-12" : "h-9 max-w-[6.5rem]"}`}
        />
      )}
    </span>
  );
}

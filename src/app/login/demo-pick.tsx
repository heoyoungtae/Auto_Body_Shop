"use client";
// 시연 서버 전용: 계정을 누르면 아이디·비밀번호 칸을 채운다(다시 칠 필요 없음).

export function DemoPick({ users, password }: { users: { loginId: string; label: string }[]; password: string }) {
  const fill = (e: React.MouseEvent<HTMLButtonElement>, loginId: string) => {
    const form = e.currentTarget.form;
    if (!form) return;
    const set = (name: string, v: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!el) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("loginId", loginId);
    set("password", password);
    form.requestSubmit();
  };
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm">
      <p className="mb-2 text-[var(--muted)]">시연 서버입니다. 아래 계정을 누르면 바로 들어갑니다(비밀번호는 모두 {password}).</p>
      <div className="grid grid-cols-2 gap-1.5">
        {users.map((u) => (
          <button key={u.loginId} type="button" onClick={(e) => fill(e, u.loginId)} className="min-h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-left text-xs hover:bg-[var(--surface-2)]">
            <b className="block">{u.loginId}</b>
            <span className="text-[var(--muted)]">{u.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

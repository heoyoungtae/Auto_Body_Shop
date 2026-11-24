"use client";
// 사진 고르기 단추 두 개: '📷 찍기'(카메라)와 '🖼 사진 올리기'(사진첩·PC 폴더).
// 휴대폰·태블릿: 찍기는 기본 카메라 앱이 열리고(capture), 올리기는 사진첩·파일에서 고른다.
// PC: 찍기는 웹캠 창(getUserMedia)이 열린다. 웹캠이 없거나 막혀 있으면 파일 고르기로 넘어간다.
import { useEffect, useRef, useState } from "react";

type Props = {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** 찍기 단추 글자(예: '다시 찍기') */
  shootLabel?: string;
  /** slot: 자리 아래 가로 두 단추 / tile: 사진 줄 끝 세로 타일 */
  look?: "slot" | "tile";
  busyLabel?: string | null;
};

const touchDevice = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export function PhotoPick({ onFiles, multiple = false, disabled = false, shootLabel = "찍기", look = "slot", busyLabel = null }: Props) {
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [webcam, setWebcam] = useState(false);

  const take = (list: FileList | null, el: HTMLInputElement | null) => {
    const files = list ? Array.from(list) : [];
    if (el) el.value = "";
    if (files.length) onFiles(files);
  };
  const shoot = () => {
    if (!touchDevice() && typeof navigator.mediaDevices?.getUserMedia === "function") setWebcam(true);
    else cam.current?.click();
  };

  const btn =
    look === "slot"
      ? "min-h-9 flex-1 rounded border border-[var(--line-strong)] px-1.5 hover:bg-[var(--accent-soft)] disabled:opacity-50"
      : "grid h-[2.375rem] w-28 place-items-center rounded border border-dashed border-[var(--line-strong)] text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50";

  return (
    <>
      <input type="file" data-assist="upload" ref={cam} accept="image/*" capture="environment" className="hidden" onChange={(e) => take(e.currentTarget.files, e.currentTarget)} />
      <input type="file" data-assist="upload" ref={file} accept="image/*" multiple={multiple} className="hidden" onChange={(e) => take(e.currentTarget.files, e.currentTarget)} />
      {busyLabel ? (
        <p className={look === "slot" ? "mt-1 min-h-9 py-2 text-center text-[var(--muted)]" : "grid h-20 w-28 place-items-center text-xs text-[var(--muted)]"}>{busyLabel}</p>
      ) : (
        <div className={look === "slot" ? "mt-1 flex gap-1" : "flex flex-col gap-1"}>
          <button type="button" disabled={disabled} onClick={shoot} className={btn} title="카메라로 바로 찍습니다(PC는 웹캠)">
            📷 {shootLabel}
          </button>
          <button type="button" disabled={disabled} onClick={() => file.current?.click()} className={btn} title="사진첩이나 PC 폴더에 있는 사진을 고릅니다">
            🖼 올리기
          </button>
        </div>
      )}
      {webcam && (
        <Webcam
          onClose={() => setWebcam(false)}
          keepOpen={multiple}
          onShot={(f) => onFiles([f])}
          onFail={() => {
            setWebcam(false);
            cam.current?.click();
          }}
        />
      )}
    </>
  );
}

/** PC 웹캠 창: 미리 보며 찍는다. 찍은 사진은 바로 올리고, 여러 장이면 창을 연 채로 계속 찍는다 */
function Webcam({ onClose, onShot, onFail, keepOpen }: { onClose: () => void; onShot: (f: File) => void; onFail: () => void; keepOpen: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let gone = false;
    dlg.current?.showModal();
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (gone) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => {
        if (!gone) fail.current();
      });
    return () => {
      gone = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        if (!b) return;
        onShot(new File([b], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setCount((n) => n + 1);
        if (!keepOpen) dlg.current?.close();
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <dialog ref={dlg} onClose={onClose} className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-[var(--fg)] backdrop:bg-black/60">
      <p className="mb-2 text-sm font-semibold">웹캠으로 찍기</p>
      <video ref={video} playsInline muted className="aspect-video w-full rounded bg-black object-contain" />
      <p className="mt-1 text-xs text-[var(--muted)]">{ready ? (count ? `${count}장 찍어 올렸습니다. 더 찍거나 닫습니다.` : "차가 화면에 다 들어오게 맞추고 '찍기'를 누릅니다.") : "카메라를 켜는 중… 브라우저가 카메라 사용을 물으면 '허용'을 누릅니다."}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!ready} onClick={snap} className="min-h-10 flex-1 rounded bg-[var(--accent)] px-3 font-semibold text-[var(--accent-fg)] disabled:opacity-50">
          📷 찍기
        </button>
        <button type="button" onClick={() => dlg.current?.close()} className="min-h-10 rounded border border-[var(--line-strong)] px-3">
          닫기
        </button>
      </div>
    </dialog>
  );
}

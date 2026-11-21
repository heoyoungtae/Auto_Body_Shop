"use client";
// 알림 클랙슨 소리(대표 지시 2026-11-21). 음원 파일 없이 브라우저가 소리를 만든다(저작권 걱정 없음).
// 자동차 경적처럼 두 음(약 415·500Hz)을 겹쳐 '빵-빵' 두 번 울린다.
// 브라우저는 사람이 화면을 한 번 누르기 전에는 소리를 막으므로, 첫 누름 때 소리 장치를 깨워 둔다(unlockHorn).
// 켜고 끄기는 이 기기에만 기억한다(localStorage 'alert:horn', 기본 켬).

const KEY = "alert:horn";
let ctx: AudioContext | null = null;

const audio = () => {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
};

export function hornOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHornOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 기억 못 해도 지금 화면에서는 동작 */
  }
}

/** 첫 누름 때 한 번 부른다. 소리 장치를 깨워야 나중에 알림이 올 때 소리가 난다 */
export function unlockHorn() {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
}

function honk(a: AudioContext, at: number, len: number) {
  const out = a.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(0.28, at + 0.015);
  out.gain.setValueAtTime(0.28, at + len - 0.04);
  out.gain.linearRampToValueAtTime(0, at + len);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  lp.Q.value = 1.2;
  lp.connect(out);
  out.connect(a.destination);
  for (const hz of [415, 500]) {
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(hz, at);
    o.connect(lp);
    o.start(at);
    o.stop(at + len + 0.02);
  }
}

/** '빵-빵'. force 면 꺼 둔 설정과 상관없이 울린다(설정 화면의 '소리 들어보기') */
export function playHorn(force = false) {
  if (!force && !hornOn()) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const t = a.currentTime + 0.02;
  honk(a, t, 0.16);
  honk(a, t + 0.24, 0.34);
}

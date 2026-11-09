"use client";
import { Button } from "../../_ui";

export function PrintButton() {
  return <Button onClick={() => window.print()}>인쇄</Button>;
}

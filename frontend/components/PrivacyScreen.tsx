"use client";

import { useTranslations } from "next-intl";
import { useBlackoutShortcut } from "../hooks/useBlackoutShortcut";

export function PrivacyScreen() {
  const t = useTranslations("PrivacyScreen");
  const dialogRef = useBlackoutShortcut();

  return (
    <dialog
      ref={dialogRef}
      data-privacy-screen
      aria-label={t("label")}
      onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip border-0 bg-black p-0 outline-2 -outline-offset-2 outline-black backdrop:bg-black"
    />
  );
}

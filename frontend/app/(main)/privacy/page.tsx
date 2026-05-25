import { getTranslations } from "next-intl/server";
import PrivacyClient from "./PrivacyClient";

export async function generateMetadata() {
  const t = await getTranslations("LegalMetadata");
  return {
    title: t("privacyTitle"),
    description: t("privacyDescription"),
  };
}

export default function PrivacyPage() {
  return <PrivacyClient />;
}

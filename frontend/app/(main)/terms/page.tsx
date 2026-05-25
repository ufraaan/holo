import { getTranslations } from "next-intl/server";
import TermsClient from "./TermsClient";

export async function generateMetadata() {
  const t = await getTranslations("LegalMetadata");
  return {
    title: t("termsTitle"),
    description: t("termsDescription"),
  };
}

export default function TermsPage() {
  return <TermsClient />;
}

import TermsClient from "./TermsClient";

export const metadata = {
  title: "Terms of Service",
  description: "Holo provides ephemeral file and text sharing with no storage. Open-source, no accounts required. Use at your own responsibility.",
};

export default function TermsPage() {
  return <TermsClient />;
}

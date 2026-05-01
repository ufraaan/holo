import PrivacyClient from "./PrivacyClient";

export const metadata = {
  title: "Privacy Policy",
  description: "Holo stores no data. No accounts, no cookies, no tracking. Files transfer directly between devices and are discarded instantly.",
};

export default function PrivacyPage() {
  return <PrivacyClient />;
}

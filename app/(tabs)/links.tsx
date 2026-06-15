import { LinksList } from "@/components/screens/LinksList";

// Pro "Links" tab — the merchant's payment-link manager. No close button (it's a
// tab, not a modal). Hidden from the bar in Personal mode (see (tabs)/_layout).
export default function LinksTab() {
  return <LinksList />;
}

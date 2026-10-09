import { redirect } from "next/navigation";

// "/social" has no content of its own — land on Postiz's calendar.
export default function SocialIndexPage() {
  redirect("/social/launches");
}

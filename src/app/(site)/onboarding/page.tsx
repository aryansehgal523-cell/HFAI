import { redirect } from "next/navigation";

export default function Onboarding() {
  redirect("/profile?welcome=1");
}

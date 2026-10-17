import { notFound } from "next/navigation";
import { testLoginEnabled } from "@/server/testing-config";
import { headers } from "next/headers";
import { TestingLab } from "@/components/testing-lab";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (
    !testLoginEnabled() ||
    (await headers()).get("host") !== "gotfoth-persona-preview.vercel.app"
  )
    notFound();
  return <TestingLab />;
}

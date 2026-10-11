import { redirect } from "next/navigation";
import { operator } from "@/server/session";

export default async function Page() {
  redirect((await operator()) ? "/papers" : "/login");
}

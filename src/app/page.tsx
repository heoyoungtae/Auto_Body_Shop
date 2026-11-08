import { redirect } from "next/navigation";
import { currentUser } from "./_lib/session";

export default async function Root() {
  redirect((await currentUser()) ? "/home" : "/login");
}

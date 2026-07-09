import { redirect } from "next/navigation";

/** Default landing: task workspace (lender tools live at `/lenders`). */
export default function HomePage() {
  redirect("/tasks");
}

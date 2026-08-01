import { redirect } from "next/navigation";

/** Legacy route — unified contacts workspace lives at `/contacts`. */
export default function RegistryPage() {
  redirect("/contacts");
}

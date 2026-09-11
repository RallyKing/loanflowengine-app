import Link from "next/link";
import { APP_HOME_HREF } from "@/lib/brandIdentity";
import { cn } from "@/lib/cn";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That URL does not match any page in this app.
      </p>
      <Link
        href={APP_HOME_HREF}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-4 text-sm font-medium text-brand-accent-foreground shadow-sm",
          "hover:bg-brand hover:text-brand-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        )}
      >
        Back to pipeline
      </Link>
    </div>
  );
}

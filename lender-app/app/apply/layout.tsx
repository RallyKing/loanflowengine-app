export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-background">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        <p>Secure client intake · Direct Lending Connection</p>
        <p className="mt-1 opacity-90">
          This portal does not replace legal disclosures or signed agreements.
        </p>
      </footer>
    </div>
  );
}

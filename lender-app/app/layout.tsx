import type { Metadata, Viewport } from "next";
import { Noto_Serif_Ethiopic } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import "./vaul-drawer.css";
import {
  convexPublicUrlForPreconnect,
  parseConvexPublicUrl,
} from "@/lib/convexPublicUrl";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { AppChrome } from "@/components/AppChrome";
import { GlobalOverlayProviders } from "@/components/GlobalOverlayProviders";
import { ColorSchemeProvider } from "@/lib/colorScheme";
import { COLOR_SCHEME_INIT_SCRIPT } from "@/lib/colorSchemeInit";
import { UserSettingsProvider } from "@/lib/userSettingsContext";
import { HelpSupportProvider } from "@/lib/helpSupportContext";
import { UserPreferencesProvider } from "@/lib/userPreferencesContext";
import { OrgBrandingProvider } from "@/lib/orgBrandingContext";
import { ProductTourRoot } from "@/components/ProductTourRoot";
import { SessionProvider } from "@/lib/sessionContext";
import { AuthStateProvider } from "@/lib/auth/authStateContext";
import { OrgPermissionsProvider } from "@/lib/orgPermissionsContext";
import { OrgSubtreeDebugBoundary } from "@/components/debug/OrgSubtreeDebugBoundary";
import { SessionBoundary } from "@/components/auth/SessionBoundary";
import { AuthBoundary } from "@/components/auth/AuthBoundary";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/sessionAuth";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/superuserImpersonation";
import { ConvexConfigMissing } from "./ConvexConfigMissing";
import { DebugEarlyClientBootstrap } from "./DebugEarlyClientBootstrap";
import { dlcBuildInfoInlineScript, readDlcBuildInfo } from "@/lib/buildInfo";
import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  PWA_THEME_COLOR,
} from "@/lib/brandIdentity";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";

/**
 * Brand font — matches the GoHighLevel set-up. Loaded with `display: swap`
 * so the page paints immediately with the system serif fallback while
 * Noto Serif Ethiopic streams in (no FOIT). The CSS variable is wired
 * into `--font-sans` in globals.css so every component picks it up.
 */
const brandFont = Noto_Serif_Ethiopic({
  subsets: ["latin", "latin-ext", "ethiopic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_DISPLAY_NAME,
  /** Phase 24.4R — treat as installable web app; calmer iOS/Android chrome behavior. */
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_DISPLAY_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/** Mobile-first: pinch-zoom allowed; safe-area friendly (Track A closure). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: PWA_THEME_COLOR,
  /** Android Chrome / Chrome: keyboard and interactive widgets resize layout, not a disjoint visual viewport snap. */
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const convexUrl = convexPublicUrlForPreconnect(
    process.env.NEXT_PUBLIC_CONVEX_URL,
  );
  /** When set, mount one browser Convex client for workspace, portal, and share routes. */
  const convexPublic = parseConvexPublicUrl(
    process.env.NEXT_PUBLIC_CONVEX_URL,
  );
  const convexBrowserOk = convexPublic.ok;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  const viewer = await verifySession(token, impersonationToken);
  const dlcBuildInfo = readDlcBuildInfo();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${brandFont.variable} h-full min-h-0`}
    >
      <head>
        <script
          // Apply stored color scheme before paint (see lib/colorSchemeInit.ts)
          dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_INIT_SCRIPT }}
        />
        <script
          // Build fingerprint for production forensics (Phase 24.2 regression).
          dangerouslySetInnerHTML={{
            __html: dlcBuildInfoInlineScript(dlcBuildInfo),
          }}
        />
        {convexUrl ? (
          <link rel="preconnect" href={convexUrl} crossOrigin="anonymous" />
        ) : null}
      </head>
      {/*
        suppressHydrationWarning: browser extensions (Grammarly, password managers, etc.)
        inject attributes into <html>/<body> before React hydrates, which would otherwise
        trigger a server/client HTML mismatch.
      */}
      <body
        // Phase 2 layout contract: body is the locked app shell; the SOLE
        // scroll container lives inside <AppChrome>'s <main>. Auth routes
        // get the `data-shell="auth"` flag so globals.css re-enables body
        // scroll for the sign-in / sign-up screens (which mount outside
        // AppChrome).
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground antialiased font-sans"
        data-shell={viewer ? "app" : "auth"}
        suppressHydrationWarning
      >
        <DebugEarlyClientBootstrap />
        <PwaServiceWorkerRegistration />
        {convexBrowserOk ? (
          <ConvexClientProvider>
            {viewer ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <SessionProvider viewer={viewer}>
                  <AuthStateProvider>
                    <SessionBoundary>
                      <UserPreferencesProvider>
                        <OrgSubtreeDebugBoundary recoverKey={viewer.userKey}>
                          <OrgPermissionsProvider>
                            <ProductTourRoot>
                              <OrgBrandingProvider>
                                <ColorSchemeProvider>
                                <UserSettingsProvider>
                                  <HelpSupportProvider>
                                    <AuthBoundary>
                                      <GlobalOverlayProviders>
                                        <AppChrome>{children}</AppChrome>
                                      </GlobalOverlayProviders>
                                    </AuthBoundary>
                                  </HelpSupportProvider>
                                </UserSettingsProvider>
                              </ColorSchemeProvider>
                            </OrgBrandingProvider>
                          </ProductTourRoot>
                          </OrgPermissionsProvider>
                        </OrgSubtreeDebugBoundary>
                      </UserPreferencesProvider>
                    </SessionBoundary>
                  </AuthStateProvider>
                </SessionProvider>
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <SessionProvider viewer={null}>
                  <AuthStateProvider>
                    <SessionBoundary>
                      {children}
                    </SessionBoundary>
                  </AuthStateProvider>
                </SessionProvider>
              </div>
            )}
          </ConvexClientProvider>
        ) : viewer ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SessionProvider viewer={viewer}>
              {convexPublic.reason === "missing" ? (
                <ConvexConfigMissing variant="missing" />
              ) : (
                <ConvexConfigMissing
                  variant="invalid"
                  detail={convexPublic.detail}
                />
              )}
            </SessionProvider>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SessionProvider viewer={null}>{children}</SessionProvider>
          </div>
        )}
        <div
          id="dlc-global-overlay-root"
          data-global-overlay-root
          data-layer="global-overlay"
          aria-hidden={!viewer}
        />
      </body>
    </html>
  );
}

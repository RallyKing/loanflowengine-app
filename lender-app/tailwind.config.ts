import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Match OS dark for `dark:` utilities only when the classic (non-SaaS)
  // color scheme is active. SaaS is always a light workspace: without this,
  // `dark:` would still win on a dark OS and break tokens + contrast.
  darkMode: [
    "variant",
    [
      '@media (prefers-color-scheme: dark) { :root:not([data-color-scheme="saas"]) & }',
    ],
  ],
  theme: {
    extend: {
      borderRadius: {
        "dlc-none": "var(--dlc-shape-corner-none)",
        "dlc-xs": "var(--dlc-shape-corner-extra-small)",
        "dlc-sm": "var(--dlc-shape-corner-small)",
        "dlc-md": "var(--dlc-shape-corner-medium)",
        "dlc-lg": "var(--dlc-shape-corner-large)",
        "dlc-xl": "var(--dlc-shape-corner-extra-large)",
        "dlc-full": "var(--dlc-shape-corner-full)",
      },
      transitionDuration: {
        "dlc-instant": "var(--dlc-motion-duration-instant)",
        "dlc-short1": "var(--dlc-motion-duration-short1)",
        "dlc-short2": "var(--dlc-motion-duration-short2)",
        "dlc-medium1": "var(--dlc-motion-duration-medium1)",
        "dlc-medium2": "var(--dlc-motion-duration-medium2)",
        "dlc-long1": "var(--dlc-motion-duration-long1)",
        "dlc-long2": "var(--dlc-motion-duration-long2)",
      },
      transitionTimingFunction: {
        "dlc-standard": "var(--dlc-motion-easing-standard)",
        "dlc-accelerate": "var(--dlc-motion-easing-standard-accelerate)",
        "dlc-decelerate": "var(--dlc-motion-easing-standard-decelerate)",
        "dlc-emphasized": "var(--dlc-motion-easing-emphasized)",
      },
      fontSize: {
        "dlc-display-sm": "var(--dlc-type-display-small-size)",
        "dlc-headline-lg": "var(--dlc-type-headline-large-size)",
        "dlc-headline-md": "var(--dlc-type-headline-medium-size)",
        "dlc-title-lg": "var(--dlc-type-title-large-size)",
        "dlc-title-md": "var(--dlc-type-title-medium-size)",
        "dlc-body-lg": "var(--dlc-type-body-large-size)",
        "dlc-body-md": "var(--dlc-type-body-medium-size)",
        "dlc-label-lg": "var(--dlc-type-label-large-size)",
        "dlc-label-md": "var(--dlc-type-label-medium-size)",
        "dlc-label-sm": "var(--dlc-type-label-small-size)",
      },
      lineHeight: {
        "dlc-display-sm": "var(--dlc-type-display-small-line)",
        "dlc-headline-lg": "var(--dlc-type-headline-large-line)",
        "dlc-headline-md": "var(--dlc-type-headline-medium-line)",
        "dlc-title-lg": "var(--dlc-type-title-large-line)",
        "dlc-title-md": "var(--dlc-type-title-medium-line)",
        "dlc-body-lg": "var(--dlc-type-body-large-line)",
        "dlc-body-md": "var(--dlc-type-body-medium-line)",
        "dlc-label-lg": "var(--dlc-type-label-large-line)",
        "dlc-label-md": "var(--dlc-type-label-medium-line)",
        "dlc-label-sm": "var(--dlc-type-label-small-line)",
      },
      letterSpacing: {
        "dlc-display-sm": "var(--dlc-type-display-small-tracking)",
        "dlc-headline-lg": "var(--dlc-type-headline-large-tracking)",
        "dlc-headline-md": "var(--dlc-type-headline-medium-tracking)",
        "dlc-title-lg": "var(--dlc-type-title-large-tracking)",
        "dlc-title-md": "var(--dlc-type-title-medium-tracking)",
        "dlc-body-lg": "var(--dlc-type-body-large-tracking)",
        "dlc-body-md": "var(--dlc-type-body-medium-tracking)",
        "dlc-label-lg": "var(--dlc-type-label-large-tracking)",
        "dlc-label-md": "var(--dlc-type-label-medium-tracking)",
        "dlc-label-sm": "var(--dlc-type-label-small-tracking)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)",
        "dlc-0": "var(--dlc-elevation-0)",
        "dlc-1": "var(--dlc-elevation-1)",
        "dlc-2": "var(--dlc-elevation-2)",
        "dlc-3": "var(--dlc-elevation-3)",
        "dlc-4": "var(--dlc-elevation-4)",
        "dlc-5": "var(--dlc-elevation-5)",
      },
      colors: {
        /** Semantic Material-style surfaces (for `bg-dlc-surface-*`) */
        "dlc-surface-page": "var(--dlc-surface-page)",
        "dlc-surface-lowest": "var(--dlc-surface-container-lowest)",
        "dlc-surface-low": "var(--dlc-surface-container-low)",
        "dlc-surface": "var(--dlc-surface-container)",
        "dlc-surface-high": "var(--dlc-surface-container-high)",
        "dlc-surface-highest": "var(--dlc-surface-container-highest)",
        "dlc-scrim": "var(--dlc-scrim)",
        background: "rgb(var(--bg) / <alpha-value>)",
        foreground: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-fg) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-fg) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-fg) / <alpha-value>)",
        // Brand constants that don't swap between modes — useful for
        // bits like the logo monogram, focus rings, and "always-gold"
        // accents that need to stay on-brand regardless of theme.
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          foreground: "rgb(var(--brand-fg) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          "accent-foreground": "rgb(var(--brand-accent-fg) / <alpha-value>)",
        },
        "nav-sidebar": "rgb(var(--nav-sidebar) / <alpha-value>)",
        "nav-sidebar-foreground":
          "rgb(var(--nav-sidebar-fg) / <alpha-value>)",
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-fg) / <alpha-value>)",
        },
        /** M3-style tenant tonal surfaces (overridden by org branding when set). */
        "dlc-tone-primary-container":
          "rgb(var(--dlc-tone-primary-container) / <alpha-value>)",
        "dlc-tone-on-primary-container":
          "rgb(var(--dlc-tone-on-primary-container) / <alpha-value>)",
        "dlc-tone-primary-outline":
          "rgb(var(--dlc-tone-primary-outline) / <alpha-value>)",
        "dlc-tone-secondary-container":
          "rgb(var(--dlc-tone-secondary-container) / <alpha-value>)",
        "dlc-tone-on-secondary-container":
          "rgb(var(--dlc-tone-on-secondary-container) / <alpha-value>)",
        "dlc-tone-secondary-outline":
          "rgb(var(--dlc-tone-secondary-outline) / <alpha-value>)",
        /** Finance momentum (not a substitute for semantic success/error). */
        "dlc-finance-credit":
          "rgb(var(--dlc-finance-credit) / <alpha-value>)",
        "dlc-finance-credit-muted":
          "rgb(var(--dlc-finance-credit-muted) / <alpha-value>)",
        "dlc-finance-debit": "rgb(var(--dlc-finance-debit) / <alpha-value>)",
        "dlc-finance-debit-muted":
          "rgb(var(--dlc-finance-debit-muted) / <alpha-value>)",
        "dlc-finance-stable":
          "rgb(var(--dlc-finance-stable) / <alpha-value>)",
        "dlc-finance-stable-muted":
          "rgb(var(--dlc-finance-stable-muted) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;

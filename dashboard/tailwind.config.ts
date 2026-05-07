import colors from "tailwindcss/colors";

const config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          400: colors.sky[400],
          500: colors.sky[500],
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        slate: colors.slate,
        sky: {
          400: colors.sky[400],
          500: colors.sky[500],
        },
        success: colors.emerald,
        warning: colors.amber,
        danger: colors.rose,
        surface: {
          dark: {
            DEFAULT: colors.slate[900],
            elevated: colors.slate[800],
            overlay: colors.slate[700],
          },
          light: {
            DEFAULT: colors.white,
            muted: colors.slate[50],
            elevated: colors.slate[100],
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(15 23 42 / 0.10), 0 1px 2px -1px rgb(15 23 42 / 0.10)",
        md: "0 4px 6px -1px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.10)",
        lg: "0 10px 15px -3px rgb(15 23 42 / 0.10), 0 4px 6px -4px rgb(15 23 42 / 0.10)",
        card: "0 4px 12px rgb(15 23 42 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;

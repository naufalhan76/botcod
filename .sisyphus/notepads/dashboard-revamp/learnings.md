# Learnings - Dashboard Revamp

## Wave 1
- Next.js 16.2.5 uses Turbopack by default, builds fast (~3-4s compile)
- shadcn/ui components need: lucide-react, class-variance-authority, clsx, tailwind-merge, @radix-ui/* packages
- The @/lib/utils.ts with cn() function is required by all shadcn components
- API proxy via next.config.js rewrites works: /api/* to http://localhost:4141/api/*
- Task agents can get blocked by content filters - have fallback plan to do it manually

## Wave 2
- Removing src/app/page.tsx requires cleaning .next cache (stale type validator)
- Route groups (dashboard) work well for shared layout without affecting URL
- ThemeProvider must be in a client component, not root layout (server component)
- Keep only one Toaster instance in Providers component
- DO NOT taskkill processes - user runs IDE on same server

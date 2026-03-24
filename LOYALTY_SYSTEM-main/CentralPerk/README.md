
  # CentralPerk

  This project runs as a Next.js frontend and connects directly to Supabase.

  ## Running the code

  From the outer project root:

  Run `npm install` once to install the app dependencies.

  Run `npm run dev` to start the local development server on `http://localhost:3000`.

  Run `npm run build` to generate the production build.

  Run `npm run server` to serve the production build on `http://localhost:3000`.

  Supabase connection values are read from `CentralPerk/.env`.

  If you cloned the repo from GitHub, create `CentralPerk/.env` first by copying `CentralPerk/.env.example`.

  For client-side Supabase access in Next.js, define these variables in `CentralPerk/.env.local`
  or `CentralPerk/.env`:

  `NEXT_PUBLIC_SUPABASE_URL`

  and either:

  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

  or:

  `NEXT_PUBLIC_SUPABASE_ANON_KEY`

  Demo auth flags use:

  `NEXT_PUBLIC_ENABLE_DEMO_AUTH`

  `NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH`

  The Next config also mirrors existing `VITE_*` values so old env files still work during migration.

  ## Member Engagement

  Developer 12's sprint scope for `EPIC-LYL-08: Member Engagement` is now available in:

  ` /customer/engagement `

  ` /admin/engagement `

  The feature set includes push campaign scheduling, challenge tracking, social sharing, surveys, and win-back campaign dashboards.

  Additional engagement-related placeholders were added to `.env.example` for app URL and push provider setup.
  

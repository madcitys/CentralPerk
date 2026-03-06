# Central Supabase (Simple Manual Workflow)

Ito lang ang gawin:

## 1) Isang central Supabase project
- Lahat ng dev naka-access sa iisang project.
- Dito lang kayo mag-eedit ng tables/policies.

## 2) Manual edit sa Supabase dashboard (mas simple)
- Open: **Supabase Dashboard -> SQL Editor**
- Preferred (one-file run):
1. `supabase/final_consolidated_sprint1.sql`

- Alternative (separate files):
1. `supabase/rewards_tasks_schema.sql`
2. `supabase/sprint1_gap_closure.sql`

## 3) Verify agad after run
- `rewards_catalog` table meron na at may seed data
- `earn_tasks` table meron na at may seed data
- app pages may laman na (Rewards / Earn Points)
- no major auth/role errors on admin/customer pages

## 4) Team rule para di magulo
- Bago mag-run ng bagong SQL, i-send muna sa group.
- Isang tao lang muna mag-run sa central DB.
- Lahat ng SQL files ilalagay sa repo para may record.

## Manual vs "push" (maikling sagot)
- **Manual (Dashboard SQL Editor):** pinaka-madali ngayon, good for school sprint/demo.
- **Push/Migrations:** mas professional at safe long-term, pero mas setup-heavy.


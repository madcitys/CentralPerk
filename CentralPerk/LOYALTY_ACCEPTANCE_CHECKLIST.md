# Loyalty Acceptance Checklist (Simple)

Source:
- `SPRINT 1 BACKLOG REVISED.pdf` (`LYL-001` to `LYL-020`)
- `SPRINT 1 BACKLOG .pdf` (no extra readable `LYL-*` lines extracted here)

## Current Status

- Total criteria: `20`
- `PASS: 18`
- `PARTIAL: 1`
- `FAIL: 1`
- Overall: **Close, but not fully acceptance-ready yet**

## What Is Already Covered

- Registration, member profile update, member lookup
- One-time welcome package generation (transaction + points credit)
- Points earning/redeeming and transaction tracking
- Manual points award (admin-side action added)
- Tier display, liability/activity/redemption/tier distribution reporting
- Member growth report (monthly trend + current vs previous month)
- Statement download flow (CSV + printable PDF from activity page)

## Remaining Gaps (Focus)

| ID | Gap | Type | Covered in your zips? | Suggested Fix |
|---|---|---|---|---|
| `LYL-010` | True background expiry processing | Backend + Database | Covered in `SQUAD3-REWARDSSYETEM-main.zip` logic pattern | Move expiry to server-side scheduled job (cron/scheduler). Keep on-demand expiry checks only as fallback. |
| `LYL-011` | Auth role hardening + routing enforcement | Backend + Security | Partially covered in this build | Client-side role storage is removed from trust path. Role now resolves from session metadata + DB (`loyalty_members`) before routing. Remaining: enforce role via server-side policy/claims (RLS) as source of truth. |

## Mock Data Still In Use (Needs Replacement)

| Area | Current Mock Source | File(s) | Replace With | Covered in your zips? |
|---|---|---|---|---|
| Customer base user fallback | `currentUser` | `Designregistrationcard-main/src/app/customer-panel/root.tsx` + `Designregistrationcard-main/src/app/data/mock-data.ts` | Keep only Supabase snapshot/session member data | Replaced in code (done) |
| Rewards catalog | `availableRewards` | `Designregistrationcard-main/src/app/customer-panel/pages/rewards.tsx` + `Designregistrationcard-main/src/app/data/mock-data.ts` | DB table (`rewards_catalog`) + Supabase query | Replaced in code; table/API not provided in 3rd zip |
| Earn tasks/opportunities | `earnOpportunities` | `Designregistrationcard-main/src/app/customer-panel/pages/earn-points.tsx` + `Designregistrationcard-main/src/app/data/mock-data.ts` | DB table (`earn_tasks`) + completion/award flow in Supabase | Replaced in code; table/API not provided in 3rd zip |
| Shared member/transaction typing tied to mock file | `MemberData`, `Transaction` from mock module | `Designregistrationcard-main/src/app/lib/loyalty-supabase.ts`, `Designregistrationcard-main/src/app/types/app-context.ts` | Move shared types to dedicated `types` module (DB-first models) | Replaced in code (done) |

Implementation note:
- The 3rd zip includes backend logic/tables for `loyalty_members`, `loyalty_transactions`, and `points_rules`.
- It does **not** include `rewards_catalog` or `earn_tasks` schema, so these two must be created/seeded in your final Supabase project.
- Added SQL helper file in this repo: `Designregistrationcard-main/supabase/rewards_tasks_schema.sql`.
- Added gap-closure SQL for pending infra items: `Designregistrationcard-main/supabase/sprint1_gap_closure.sql`.

## Admin Stability Note

- "DB/RLS issue" means some background queries can fail if table permissions (RLS policies) block the current role/session from reading or writing rows.
- This does **not** mean your main admin features are gone; it means one background step (expiry processing) should not be allowed to crash page loading.
- Current fix in code: expiry background call is now non-blocking for admin page load.

## Auth/Role + Routing Note

This part is **partially fixed**.

What works now:
- Route guards exist (`/customer`, `/admin`).
- Login no longer trusts localStorage role.
- Role is validated from session metadata and DB membership before navigation.

What is still weak:
- Final source-of-truth should be server-enforced role claims/policies.
- Legacy email-suffix fallback remains for compatibility with existing admin accounts.

## Recommended Order To Finish

1. Implement server-scheduled expiry job (`LYL-010`)
2. Finish server-side role enforcement (`LYL-011`)
3. Optional hardening: remove legacy admin email-suffix fallback after role claims are fully migrated

## Final Sprint 1 Actions (Do This)

1. Run `Designregistrationcard-main/supabase/rewards_tasks_schema.sql` in your final Supabase SQL editor.
2. Verify customer pages now load live DB content:
   - Rewards should come from `rewards_catalog`
   - Earn Points tasks should come from `earn_tasks`
3. Add Supabase scheduler/cron for expiry processing (`LYL-010`) so expiry runs server-side without relying on page visits.
4. Add/confirm RLS + role policy enforcement (`LYL-011`) for `/admin` vs `/customer` data access.
5. Re-test all acceptance criteria from both Sprint 1 PDFs end-to-end on the final Supabase project.

Why item 3 is still pending:
- I can implement app code and SQL scripts in this repo, but I cannot directly execute changes in your hosted Supabase project from this environment.
- Scheduler setup and RLS policy activation must be applied in your Supabase dashboard/SQL editor (or by you running migration SQL against that project).

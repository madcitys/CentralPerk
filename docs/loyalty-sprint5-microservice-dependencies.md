LOYALTY SPRINT 5 DEPENDENCY ANALYSIS

Purpose

This document checks whether any Sprint 5 Loyalty System tasks depend on unfinished Sprint 4 microservices work, with special focus on the tasks listed in Squad 3_SPRINT 5 Task Deployment.pdf.

Sources Used

- SPRINT 4 BACKLOG.pdf
- SPRINT 5 BACKLOG.pdf
- Squad 3_SPRINT 5 Task Deployment.pdf

Summary

Yes, several Sprint 5 Loyalty tasks depend on Sprint 4 microservices work.

The main Sprint 4 dependency stories are:

- LYL-S4-009 - Extract Points Engine Service
- LYL-S4-010 - Extract Campaign Service
- LYL-S4-011 - Loyalty API Gateway Setup

Sprint 5 explicitly treats the Points Engine Service, Campaign Service, and Loyalty API Gateway as services that were already extracted in Sprint 4. Because of that, Sprint 5 testing, backend reorganization, and some CI-related tasks are affected if the Sprint 4 microservices are still unfinished.

Sprint 4 Loyalty Work That Other Tasks Depend On

LYL-S4-009 - Extract Points Engine Service

This story covers extracting the points engine into its own service, including:

- points award and redeem logic
- tier calculation logic
- points expiry job
- database migration
- updating the monolith to call the service

LYL-S4-010 - Extract Campaign Service

This story covers extracting the campaign logic into its own service, including:

- campaign creation and management
- A/B assignment logic
- budget tracking
- auto-pause behavior
- points engine integration for campaign multipliers

LYL-S4-011 - Loyalty API Gateway Setup

This story covers:

- routing loyalty traffic to the extracted services
- role-based authorization
- rate limiting
- gateway load handling
- updating frontend clients to use the gateway URL

Sprint 5 Loyalty Tasks That Depend On Sprint 4 Microservices

1. Direct Dependencies

These tasks cannot be completed properly unless the Sprint 4 services already exist and are working.

LYL-S5-001 - Points Engine Unit and Integration Tests

Tasks:

- LYL-S5-001-T1
- LYL-S5-001-T2
- LYL-S5-001-T3
- LYL-S5-001-T4
- LYL-S5-001-T5

Dependency:

- Depends directly on LYL-S4-009

Reason:

These tasks are specifically about testing the extracted Points Engine Service. If that service is unfinished, unstable, or still changing, then the Sprint 5 test scope is also not final.

LYL-S5-002 - Campaign Service Unit and Integration Tests

Tasks:

- LYL-S5-002-T1
- LYL-S5-002-T2
- LYL-S5-002-T3
- LYL-S5-002-T4
- LYL-S5-002-T5

Dependency:

- Depends directly on LYL-S4-010

Reason:

These tasks are about testing the extracted Campaign Service. They rely on the service being present, stable, and connected to the correct logic and database flows.

LYL-S5-003 - Loyalty Contract Tests

Tasks:

- LYL-S5-003-T1
- LYL-S5-003-T2
- LYL-S5-003-T3
- LYL-S5-003-T4
- LYL-S5-003-T5

Dependency:

- Depends directly on LYL-S4-009
- Depends directly on LYL-S4-010

Reason:

Pact consumer tests and provider verification require real, stable endpoints and contracts from the Points Engine and Campaign Service. If either service is still incomplete, the contract work is also blocked or unreliable.

LYL-S5-004 - Loyalty Load Tests

Tasks:

- LYL-S5-004-T1
- LYL-S5-004-T2
- LYL-S5-004-T3
- LYL-S5-004-T4
- LYL-S5-004-T5

Dependency:

- Depends on LYL-S4-009
- Depends on LYL-S4-010
- Likely depends on LYL-S4-011

Reason:

Load testing only makes sense once the actual services and their main endpoints are already working. If the expected load path goes through the Loyalty API Gateway, then the gateway also needs to be complete.

2. Structural Dependencies

These tasks are not mainly about testing, but they still assume the Sprint 4 backend services already exist in usable form.

LYL-S5-005 - Separate Loyalty Frontend and Backend Folders

Tasks with dependency:

- LYL-S5-005-T3
- LYL-S5-005-T4
- LYL-S5-005-T5

Dependency:

- Depends on LYL-S4-009
- Depends on LYL-S4-010
- Depends on LYL-S4-011

Reason:

These tasks involve moving backend service folders into loyalty-backend, updating imports and configs, and verifying that both sides still run. That only works if the extracted services and gateway are already in place.

LYL-S5-006 - Update Loyalty CI/CD Configs for New Structure

Tasks with dependency:

- LYL-S5-006-T1
- LYL-S5-006-T2

Dependency:

- Depends on LYL-S4-009
- Depends on LYL-S4-010
- Depends on LYL-S4-011

Reason:

Splitting backend workflows and updating Docker or compose paths assumes the backend services and gateway already exist and have a stable structure.

3. Indirect Dependencies

These tasks are not blocked at the very start, but they can fail later if the Sprint 4 microservices are still unfinished.

LYL-S5-008 and LYL-S5-009 - PR and CI/CD Flow

Tasks with dependency:

- LYL-S5-008-T4
- LYL-S5-009-T2
- LYL-S5-009-T3
- LYL-S5-009-T4

Dependency:

- Indirectly depends on the completion of LYL-S4-009, LYL-S4-010, and LYL-S4-011

Reason:

The GitHub flow itself can begin, but merges and pipeline validation can still fail if unfinished microservices work causes broken builds, failing tests, or unstable service contracts.

Tasks From Squad 3_SPRINT 5 Task Deployment.pdf That Rely On Microservices

Kiefer - Theme 1: Loyalty Microservices Testing

These are the strongest Sprint 5 dependencies on Sprint 4 microservices:

- LYL-S5-001-T1 to LYL-S5-001-T5
- LYL-S5-002-T1 to LYL-S5-002-T5
- LYL-S5-003-T1 to LYL-S5-003-T5
- LYL-S5-004-T1 to LYL-S5-004-T5

Why:

Theme 1 is built entirely around testing the services that were supposed to be extracted in Sprint 4.

Carlos - Theme 2: Loyalty File Structure Reorganization

These are structural dependencies:

- LYL-S5-005-T3
- LYL-S5-005-T4
- LYL-S5-005-T5
- LYL-S5-006-T1
- LYL-S5-006-T2

Why:

These tasks assume the backend services and gateway already exist and can be moved, reconfigured, and run independently.

Jian - Theme 3: Loyalty GitHub Push Workflow

These are indirect dependencies:

- LYL-S5-008-T4
- LYL-S5-009-T2
- LYL-S5-009-T3
- LYL-S5-009-T4

Why:

These tasks depend on successful CI, passing tests, and stable project structure, which can all be affected by unfinished Sprint 4 microservices.

Lower-Risk Sprint 5 Loyalty Tasks

These tasks are less dependent on Sprint 4 microservices being fully final:

- LYL-S5-005-T1
- LYL-S5-005-T2
- LYL-S5-006-T3
- LYL-S5-007-T1
- LYL-S5-007-T3
- LYL-S5-007-T4
- LYL-S5-008-T1
- LYL-S5-008-T2
- LYL-S5-008-T3

These can usually start earlier, although some may still be affected later by CI failures or path changes.

Final Conclusion

If Sprint 4 Loyalty microservices are not yet final, then Sprint 5 Loyalty work is affected.

The most exposed Sprint 5 work is:

1. Kiefer's entire Theme 1 block because it directly tests the extracted services.
2. Carlos's backend move and backend CI/config tasks because they assume those services already exist in final form.
3. Jian's merge and CI-fix tasks because pipeline success still depends on stable backend services and gateway behavior.

Recommended Planning Order

To reduce rework, the safest order is:

1. Finish or stabilize LYL-S4-009 - Extract Points Engine Service.
2. Finish or stabilize LYL-S4-010 - Extract Campaign Service.
3. Confirm whether LYL-S4-011 - Loyalty API Gateway Setup must also be complete before Sprint 5 testing is considered valid.
4. After that, proceed with LYL-S5-001 to LYL-S5-004 as the main Sprint 5 follow-on work.

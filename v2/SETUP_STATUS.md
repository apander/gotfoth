# Hosted setup status

Updated 7 October 2026. Local application servers have been stopped and the special local demo launcher removed.

- Vercel project: `gotfoth`, Next.js root `v2`; production URL https://gotfoth.vercel.app.
- Separate v2 Neon production branch initialized with a restricted runtime role. Development and v1 data are not migrated or deleted.
- Sign-in is Google only. Dummy parent and student accounts are not part of the app.
- Google Cloud project: `study-vault-v2-510821`. OAuth client callbacks now use the hosted /api/auth/callback/google and /api/calendar/callback URLs; local callbacks were replaced.
- Paid AI and payments remain disabled. Catalogue import, private v2 Blob storage, marking evaluation, real Calendar publishing, payment configuration and restore validation remain launch tasks.
- Hobby cron dispatch is daily. A more frequent dispatcher is required before timed production learning/Calendar expectations can be met.

## Rollback

Previous v1 deployment: `dpl_2S99eae3FD7GdrHJ6ERfc3BCr8dC` (`gotfoth-prq0zheca-apanders-projects-8cc2f736.vercel.app`). Its source and data remain intact. Restore the previous deployment alias and project root/framework settings if rollback is needed. Keep deployment secrets in the ignored operator files, never in Git.

## Deployment verification

Production deployment `dpl_6BTB2TGAX3vxB9h9mLEBmoTMyU5E` is Ready and aliased to gotfoth.vercel.app. TypeScript, the production build and the domain/database tests passed at that deployment. Live HTTP checks confirmed Google sign-in, denial of administration and cross-family access, and successful access to a member's own workspace.

## UX refactor · 7 October 2026

The GotFoth redesign is live on deployment `dpl_5fow1wkhUrrSHj4SLqELYeLWdBLo`. Shared tokens, navigation, continuation-first home, subjects/paper lists, focused question player, results summary, topic history, schedule forms and secondary screens are documented in [FRONTEND.md](FRONTEND.md).

Verification: TypeScript and Vercel production build pass; domain/database tests pass; hosted browser scenarios pass across 375, 768, 1024 and 1440px. The parent scenarios additionally verify the schedule form's existing API payload. Screenshot review corrected editor/action overlap and CSS list markers. Live home and Google OAuth redirect checks pass. Browser fixtures are synthetic and do not alter production learner records.

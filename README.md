# College Quiz Competition

A responsive weekly MCQ competition starter with Supabase authentication, persistent scoring, admin question management, a weekly leaderboard and an archived winners table.

## Important status
This is a deployable starter project, not a live public website yet. You must connect a Supabase project and deploy the frontend before students can use it. Never put the Supabase `service_role` key in browser code.

## 1. Create the database and login
1. Open https://supabase.com and create a project.
2. In **SQL Editor**, run the complete `supabase.sql` file.
3. In **Project Settings → API**, copy the Project URL and the public anon/publishable key.
4. Open `src.js` and replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` and `PASTE_YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY_HERE`.
5. In **Authentication → URL Configuration**, set the Site URL to your eventual deployed URL. Add the same URL to Redirect URLs.
6. For a public competition, decide whether email confirmation is required in **Authentication → Providers → Email**.

## 2. Make your account the admin
1. Register an account through the website.
2. In Supabase **SQL Editor**, run this separately after replacing the email:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
   ```
3. Log out and log back in. The Admin Workspace should appear.
4. Add questions with four options and the correct option. Questions are published for the current IST week.

## 3. Run locally
Install Node.js (LTS), unzip the project, open a terminal in the project folder, then:
```bash
npm install
npm run dev
```
Open the local URL shown by Vite.

## 4. Publish the public site
Recommended beginner route: **Netlify** or **Vercel**.
- Push this project to a private/public GitHub repository, or upload the project to your chosen host.
- Set build command to `npm run build` and publish/output directory to `dist`.
- Deploy, copy the public HTTPS URL, and set it as Supabase **Site URL** plus an allowed Redirect URL.
- Keep only the public Supabase anon/publishable key in `src.js`; RLS and server-side SQL functions protect scoring. Do not add the service-role key to frontend files.

## 5. Weekly operation
- Week boundaries are Monday 00:00 through Sunday 23:59:59 in India Standard Time (IST).
- Questions are associated with their Monday `week_start` date. Old scores stay in `attempts`; the leaderboard queries the active week.
- Archive function: schedule `public.archive_previous_week()` to run every Monday at 00:05 IST using Supabase Cron. Cron availability/plan can vary; if unavailable, an administrator can run `select public.archive_previous_week();` manually in the SQL editor every Monday. Do not rely on the archive table until this schedule/manual step is configured.
- This starter accepts one recorded answer per participant per question per week. Duplicate submissions for the same question do not earn points twice.

## Before launching to a college
- Test with two student accounts and one admin account.
- Verify email confirmation, password reset, and account recovery settings.
- Review privacy requirements: the leaderboard displays participant display names and scores to signed-in users.
- Consider a maximum quiz duration, anti-cheating controls, and an admin-only question preview before running a high-stakes competition.

## Project Launch Plan (5-Day Single-Class Pilot)

### Goal
Launch Presence in **one class first** to maximize recognition accuracy and reliability before wider rollout.

### Success criteria for pilot
- Gate Mode correctly recognizes registered students with minimal false “unrecognized” results.
- Attendance updates are reflected immediately in attendance stats and admin views.
- Registration flow is stable (no duplicate drafts, no duplicate final submissions).
- Parent notifications (email/WhatsApp/SMS) deliver consistently for pilot events.
- No critical runtime errors during normal daily usage.

## Day-by-day execution

### Day 1 — Stability freeze + critical flow verification
- Freeze non-essential visual changes.
- Run focused bug triage for 3 critical flows:
  - Register
  - Gate Mode
  - Attendance
- Build a launch checklist with pass/fail outcomes per flow.
- Confirm pilot class roster quality (clear photos, complete parent contact fields).

### Day 2 — Registration and data integrity hardening
- Validate registration draft/resume behavior end-to-end.
- Verify idempotency protections prevent duplicate records.
- Validate that student records, face samples, and parent contacts are complete and visible.
- Add/confirm guardrails for slow network retries to avoid duplicate writes.

### Day 3 — Gate Mode accuracy and speed tuning
- Test Gate Mode in real classroom-like conditions (lighting, angle, distance, movement).
- Calibrate recognition thresholds using pilot-class sample runs.
- Optimize scan loop responsiveness (fast feedback, reduced UI blocking).
- Validate fallback behavior for unrecognized students (clear operator path).

### Day 4 — Attendance consistency + notifications QA
- Verify manual and auto attendance confirmation both persist correctly.
- Confirm admin dashboard and stats update in near real-time after each attendance event.
- Run notification matrix test:
  - Email
  - WhatsApp
  - SMS
- Validate error handling and user feedback when any channel fails.

### Day 5 — Launch rehearsal + go-live
- Execute full technical smoke test on mobile and desktop.
- Run one complete “school day simulation” for the single class:
  - Morning entry (Gate Mode)
  - Attendance sync
  - Admin review
  - Parent notification trigger
- Capture known issues and classify:
  - Must-fix before pilot
  - Safe to defer
- Go live for pilot class with active monitoring window.

## Technical QA checklist (pilot gate)
- Authentication/session stability across protected routes.
- Register page: no draft spam, no duplicate student creation.
- Gate page: opens reliably, scanner starts reliably, no hook/runtime crashes.
- Attendance page: manual confirmation writes to database and propagates to dashboards.
- Admin page: no dynamic import failures, live stats refresh works.
- Notification functions: valid credentials, successful sends, clear failure logs.
- Performance: route transitions smooth, loading skeletons shown on heavy pages.

## Monitoring and incident response (pilot week)
- Monitor critical errors every day during class start window.
- Keep a quick rollback path for Gate Mode threshold/config changes.
- Maintain a short incident log:
  - time
  - feature
  - symptom
  - fix applied
  - verification result

## Pilot exit criteria (before expanding beyond one class)
- 3 consecutive school days without critical failures.
- Recognition accuracy and attendance correctness meet school expectations.
- Notification delivery is consistently reliable for pilot use cases.
- Team is confident in standard operating flow for daily use.

## Technical details
- Prioritize reliability over new features during this 5-day window.
- Use controlled threshold tuning in Gate Mode and document each change with measured outcomes.
- Keep write paths idempotent for registration and attendance events.
- Validate real-time updates through the full chain: write → dashboard/admin view.
- Treat notification channels as independent; one failure should not block others.
## Approved implementation plan

### 1) ID card + print fixes (first batch)

- Increase QR size in both generated card output and modal preview so they match visually.
- Make student loading deterministic and complete for all registered students by tightening dedupe identity priority and stable sorting.
- Keep A4 export locked to **9 cards/page** (3×3) with fixed card dimensions, spacing, and non-intrusive cut marks.
- Fix print glitches by hardening render timing, improving popup-blocked fallback, and ensuring consistent image/background rendering.
- Validate by checking exported count equals registered count and first PDF page renders exactly 9 cards.

### 2) QR scanner effectiveness (QR scanner only)

- Upgrade `QRCodeScanner` to true loop scanning with controlled frame cadence and safe start/stop lifecycle.
- Add anti-spam protection using scan cooldown windows + in-flight lock to prevent duplicate attendance writes.
- Improve speed by reducing unnecessary work per frame and reusing detector where possible.
- Support detection from anywhere on screen by scanning full frame continuously (no center-only dependence).
- Add robust invalid/duplicate feedback states without interrupting the scan loop.

### 3) Realtime admin updates across all places

- Ensure all relevant admin views subscribe to realtime changes (`attendance_records`, `face_descriptors`, `gate_entries`, and related profile rows as needed).
- Normalize refresh behavior so Student Details, Face Samples, ID card generator counts, and dashboard stats stay in sync automatically.
- Avoid noisy re-fetch loops by debouncing/throttling subscription-driven refreshes.

### 4) Realtime push + email notifications (using Resend)

- Keep push flow wired through existing push service/edge function, triggered from realtime attendance/gate events.
- Add Resend-powered email dispatch path in backend function(s) for attendance/gate alerts with input validation and structured error handling.
- Add required secret flow for Resend key (secure project secret, not client-side), then wire function invocation from the event path.
- Return provider errors clearly to the client/admin logs for operational visibility.  

- also puch local app notifications realtime 

### 5) Verification pass

- Verify: larger QR appears in preview + export, all registered students included, 9-per-page PDF layout stable.
- Verify QR scanner: no spam duplicates, continuous loop works, fast detection from any screen area.
- Verify realtime: updates appear in admin tabs without manual refresh.
- Verify notifications: push and Resend email both fire on new events and failures are surfaced cleanly.

## Technical notes

- Primary files: `src/components/admin/StudentIDCardGenerator.tsx`, `src/components/attendance/QRCodeScanner.tsx`, `src/components/admin/StudentDetailsTable.tsx`, `src/components/admin/StudentFaceSamplesManager.tsx`, `src/pages/Admin.tsx`, `src/hooks/useRealtimeAttendance.ts`, notification edge functions.
- Resend integration will be implemented server-side via secrets-backed function calls (no API key in frontend code).
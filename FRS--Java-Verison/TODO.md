# FRS Auto Re-invitation Emails Implementation

## Completed
- [x] Add sendEnrollmentRejection function to backend/src/services/emailService.js
- [x] Update reject endpoint in enrollmentRoutes.js (sends rejection email + creates new invitation link)

## Future Steps
- Update frontend reject button to work with new endpoint
- Test end-to-end flow (reject → email → new enrollment)
- Add env var ENROLLMENT_PORTAL_URL if missing
- Restart backend to apply changes

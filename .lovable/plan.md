# Student profile and personalized guidance

## What will change
- Replace fixed subject inputs with an editable list of subjects. Each subject has a name, marks earned, and an editable maximum; teachers can add or remove subjects.
- Capture attendance as sessions attended out of sessions held and calculate its percentage. Validate counts and score ranges before estimating or requesting guidance.
- Preserve the existing progress estimate by normalizing subject marks to percentages and deriving attendance percentage from the entered counts.
- Add an AI recommendation action to the student result. Show personalized next steps and a plain-language explanation of the strongest profile factors; retain the existing rule-based suggestions as a clearly separate fallback/context.
- Keep the student ID and name out of the AI request, avoid saving the profile or AI response, and show a safe error/recovery state if generation fails.

## Technical approach
- Refactor the student-profile model and estimator to support custom subjects and attended/held counts while keeping existing CSV/demo behavior compatible where practical.
- Add a validated, authenticated TanStack server function that calls the installed Lovable AI Gateway SDK with the workspace-resolved text model. Keep the prompt and model call on the server and send only the numeric profile plus subject labels.
- Add profile controls and recommendation/explanation states in the existing single-page prediction view, using current design tokens and UI controls.
- Add focused tests for attendance percentage, subject maximum normalization, and profile validation; run the relevant tests and verify the browser workflow and preview diagnostics.

/**
 * Shared onboarding step identifiers (v2.5.0).
 *
 * The flow grew from four to five steps when the opt-in AI assistant setup
 * landed between Paths (3) and Updates (5). Keeping the union + total in one
 * place means the Stepper, footer, and per-step headers can't drift.
 */

export type StepId = 1 | 2 | 3 | 4 | 5;

/** Total step count — rendered in the "STEP 0X / 0Y" eyebrow on each step. */
export const STEP_COUNT = 5;

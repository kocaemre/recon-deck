import { WelcomeFlow } from "./_components/WelcomeFlow";

/**
 * /welcome — first-run onboarding orchestrator (v1.9.0).
 *
 * Server component shell. The actual stepper + step content lives in
 * the client `<WelcomeFlow>` so step state stays out of the URL (we
 * could query-string the step, but the design wants the stepper to
 * own its own progression — back / clickable-done — without polluting
 * browser history).
 *
 * The reverse-onboarded guard runs in the layout above; this page
 * trusts it.
 */

export default function WelcomePage() {
  return <WelcomeFlow />;
}

"use client";

/**
 * WelcomeFlow — orchestrates the four onboarding steps (v1.9.0).
 *
 * Top chrome (brand + stepper + offline pill) and the StepFooter are
 * persistent across all four steps. The middle slot swaps between the
 * step components based on local `current` state.
 *
 * Form state (path config + update opt-in) lives here so it survives
 * Back/Next navigation without being persisted to the URL.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Stepper } from "./Stepper";
import { StepFooter } from "./StepFooter";
import { ScopeStep } from "./ScopeStep";
import { TourStep } from "./TourStep";
import { PathsStep } from "./PathsStep";
import { UpdatesStep } from "./UpdatesStep";
import { SkipDialog } from "./SkipDialog";
import { completeOnboarding, skipOnboarding } from "../_actions";

export interface OnboardingForm {
  localExportDir: string;
  kbUserDir: string;
  wordlistBase: string;
  updateCheck: boolean;
}

const INITIAL_FORM: OnboardingForm = {
  localExportDir: "",
  kbUserDir: "",
  wordlistBase: "",
  updateCheck: false,
};

export function WelcomeFlow() {
  const router = useRouter();
  const [current, setCurrent] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<OnboardingForm>(INITIAL_FORM);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function next() {
    if (current < 4) setCurrent((current + 1) as 1 | 2 | 3 | 4);
  }
  function back() {
    if (current > 1) setCurrent((current - 1) as 1 | 2 | 3 | 4);
  }

  async function finish() {
    setPending(true);
    try {
      const res = await completeOnboarding(form);
      if (!res.ok) {
        toast.error(res.error ?? "Could not write app_state.");
        return;
      }
      // The action redirects on the server side; pushing here ensures
      // the client transitions even if Next.js elides the response.
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function exitSkip() {
    setPending(true);
    try {
      const res = await skipOnboarding(form);
      if (!res.ok) {
        toast.error(res.error ?? "Could not write app_state.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function handleSkip() {
    if (current === 3) {
      setSkipDialogOpen(true);
      return;
    }
    void exitSkip();
  }

  // Enter triggers the primary CTA on steps 1 and 4. We bind a single
  // listener at the orchestrator level so step components can stay
  // declarative.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Enter") return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (current === 1) {
        ev.preventDefault();
        next();
      } else if (current === 4) {
        ev.preventDefault();
        void finish();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, form]);

  const stepInfo = STEP_FOOTER_CONFIG[current];

  return (
    <div
      className="grid h-screen w-full"
      style={{ gridTemplateRows: "auto 1fr auto", background: "var(--bg-0)" }}
    >
      {/* Top chrome */}
      <header
        className="flex items-center"
        style={{
          padding: "14px 28px",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}
      >
        <div
          className="grid place-items-center mono"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "var(--accent)",
            color: "#05170d",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          rd
        </div>
        <span
          className="font-semibold"
          style={{ fontSize: 13, letterSpacing: "-0.01em" }}
        >
          recon-deck
        </span>
        <span
          className="mono inline-flex items-center"
          style={{
            padding: "1px 7px",
            borderRadius: 3,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            fontSize: 10.5,
            color: "var(--fg-muted)",
            lineHeight: 1.4,
          }}
        >
          first run
        </span>

        <div style={{ marginLeft: "auto" }}>
          <Stepper current={current} onJump={(id) => setCurrent(id)} />
        </div>

        <div
          className="ml-auto flex items-center"
          style={{ gap: 6, fontSize: 11, color: "var(--fg-subtle)" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "var(--accent)",
            }}
          />
          <span className="mono">offline</span>
        </div>
      </header>

      {/* Step body */}
      <div style={{ overflow: "auto" }}>
        {current === 1 && <ScopeStep />}
        {current === 2 && <TourStep />}
        {current === 3 && (
          <PathsStep
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />
        )}
        {current === 4 && (
          <UpdatesStep
            checked={form.updateCheck}
            onChange={(updateCheck) =>
              setForm((prev) => ({ ...prev, updateCheck }))
            }
          />
        )}
      </div>

      {/* Footer */}
      <StepFooter
        step={current}
        onBack={back}
        onNext={current === 4 ? () => void finish() : next}
        onSkip={handleSkip}
        nextLabel={stepInfo.nextLabel}
        skipLabel={stepInfo.skipLabel}
        primary={stepInfo.primary}
        pending={pending}
      />

      <SkipDialog
        open={skipDialogOpen}
        onOpenChange={setSkipDialogOpen}
        onConfirm={() => {
          setSkipDialogOpen(false);
          void exitSkip();
        }}
      />
    </div>
  );
}

const STEP_FOOTER_CONFIG: Record<
  1 | 2 | 3 | 4,
  { nextLabel: string; skipLabel: string; primary: boolean }
> = {
  1: {
    nextLabel: "Take the tour",
    skipLabel: "Skip onboarding",
    primary: true,
  },
  2: { nextLabel: "Continue", skipLabel: "Skip onboarding", primary: false },
  3: {
    nextLabel: "Continue",
    skipLabel: "Skip configuration…",
    primary: false,
  },
  4: {
    nextLabel: "Land on first engagement",
    skipLabel: "Skip onboarding",
    primary: true,
  },
};

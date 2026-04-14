"use client";

import { StudyUI } from "@/components/workspace/study/StudyUI";
import type { Entitlement } from "@/components/chat/billing/types";
import type { StudyEntitlement } from "@/components/workspace/study/study-types";
import { getStudyBasePlanLimits, normalizePlan } from "@/lib/plans/productLimits";

import { CompactRouteIntro, PublicWorkspaceShell } from "./PublicWorkspaceShell";

function toStudyEntitlement(entitlement: Entitlement | null): StudyEntitlement | null {
  if (!entitlement) return null;

  const normalizedPlan = normalizePlan(entitlement.plan);
  const defaults = getStudyBasePlanLimits(normalizedPlan);

  return {
    plan: entitlement.plan,
    unlimited: entitlement.unlimited,
    studyGenerationsPerDay: entitlement.studyGenerationsPerDay ?? defaults.generationsPerDay,
    studyMaxFileSizeBytes: entitlement.studyMaxFileSizeBytes ?? defaults.maxFileSizeBytes,
    studyMaxExtractedChars: entitlement.studyMaxExtractedChars ?? defaults.maxExtractedChars,
    studyMaxQuizQuestions: entitlement.studyMaxQuizQuestions ?? defaults.maxQuizQuestions,
    studyMaxSelectableModes: entitlement.studyMaxSelectableModes ?? defaults.maxSelectableModes,
    studyAllowedDifficulties: entitlement.studyAllowedDifficulties ?? defaults.allowedDifficulties,
    usedStudyCountToday: entitlement.usedStudyCountToday ?? 0,
  };
}

export function AiStudyWorkspacePage() {
  return (
    <PublicWorkspaceShell mode="study">
      {({ entitlement, locked, isZh, refreshEntitlement }) => {
        const studyEntitlement = toStudyEntitlement(entitlement);

        return (
          <>
            <CompactRouteIntro
              eyebrow="AI Study"
              title="AI Study workspace for generating notes, flashcards, and quizzes from uploaded documents"
              intro="Use the NexusDesk AI Study workspace directly on this route. Upload PDFs, DOCX files, or slide decks, extract the key material, and turn it into revision-ready outputs from an indexable public page."
            />
            <StudyUI isZh={isZh} locked={locked} entitlement={studyEntitlement} onUsageRefresh={refreshEntitlement} />
          </>
        );
      }}
    </PublicWorkspaceShell>
  );
}

import { prisma } from "@/lib/prisma";
import type { StudyGenerationResult, StudyMode, StudyQuizType } from "./types";

export type StudySessionListItem = {
  id: string;
  title: string;
  fileName: string | null;
  selectedModes: StudyMode[];
  selectedQuizTypes: StudyQuizType[];
  createdAt: Date;
  updatedAt: Date;
};

export async function listStudySessions(userId: string): Promise<StudySessionListItem[]> {
  const rows = await prisma.studySession.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      fileName: true,
      selectedModes: true,
      selectedQuizTypes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    selectedModes: (row.selectedModes as StudyMode[]) ?? [],
    selectedQuizTypes: (row.selectedQuizTypes as StudyQuizType[]) ?? [],
  }));
}

export async function getStudySessionById(userId: string, id: string) {
  const row = await prisma.studySession.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      fileName: true,
      fileSizeBytes: true,
      mimeType: true,
      selectedModes: true,
      selectedQuizTypes: true,
      resultJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return null;
  return {
    ...row,
    selectedModes: (row.selectedModes as StudyMode[]) ?? [],
    selectedQuizTypes: (row.selectedQuizTypes as StudyQuizType[]) ?? [],
    resultJson: row.resultJson as StudyGenerationResult,
  };
}

export async function createStudySession(input: {
  userId: string;
  title: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  selectedModes: StudyMode[];
  selectedQuizTypes?: StudyQuizType[];
  result: StudyGenerationResult;
}) {
  return prisma.studySession.create({
    data: {
      userId: input.userId,
      title: input.title,
      fileName: input.fileName ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      mimeType: input.mimeType ?? null,
      selectedModes: input.selectedModes,
      selectedQuizTypes: input.selectedQuizTypes ?? [],
      resultJson: input.result,
    },
    select: {
      id: true,
      title: true,
      fileName: true,
      selectedModes: true,
      selectedQuizTypes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function renameStudySession(userId: string, id: string, title: string) {
  return prisma.studySession.updateMany({
    where: { id, userId },
    data: { title },
  });
}

export async function deleteStudySession(userId: string, id: string) {
  return prisma.studySession.deleteMany({ where: { id, userId } });
}

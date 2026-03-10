import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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

function isStudySessionTableMissing(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    const table = String((error.meta as { table?: unknown } | undefined)?.table ?? "");
    if (table.includes("StudySession")) return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("StudySession") && message.includes("does not exist");
}

export async function listStudySessions(userId: string): Promise<StudySessionListItem[]> {
  try {
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
  } catch (error) {
    if (isStudySessionTableMissing(error)) {
      console.warn("[study.history] StudySession table missing; returning empty history");
      return [];
    }
    throw error;
  }
}

export async function getStudySessionById(userId: string, id: string) {
  try {
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
  } catch (error) {
    if (isStudySessionTableMissing(error)) {
      console.warn("[study.history] StudySession table missing; get by id disabled");
      return null;
    }
    throw error;
  }
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
  try {
    return await prisma.studySession.create({
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
  } catch (error) {
    if (isStudySessionTableMissing(error)) {
      console.warn("[study.history] StudySession table missing; skipping persistence");
      return null;
    }
    throw error;
  }
}

export async function renameStudySession(userId: string, id: string, title: string) {
  try {
    return await prisma.studySession.updateMany({
      where: { id, userId },
      data: { title },
    });
  } catch (error) {
    if (isStudySessionTableMissing(error)) {
      console.warn("[study.history] StudySession table missing; rename disabled");
      return { count: 0 };
    }
    throw error;
  }
}

export async function deleteStudySession(userId: string, id: string) {
  try {
    return await prisma.studySession.deleteMany({ where: { id, userId } });
  } catch (error) {
    if (isStudySessionTableMissing(error)) {
      console.warn("[study.history] StudySession table missing; delete disabled");
      return { count: 0 };
    }
    throw error;
  }
}

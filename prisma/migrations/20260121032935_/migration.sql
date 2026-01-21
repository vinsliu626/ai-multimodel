-- CreateTable
CREATE TABLE "AiNoteTranscript" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNoteTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNoteSummaryPart" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "partIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNoteSummaryPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNoteJob" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'asr',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNoteJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiNoteTranscript_noteId_idx" ON "AiNoteTranscript"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "AiNoteTranscript_noteId_chunkIndex_key" ON "AiNoteTranscript"("noteId", "chunkIndex");

-- CreateIndex
CREATE INDEX "AiNoteSummaryPart_noteId_idx" ON "AiNoteSummaryPart"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "AiNoteSummaryPart_noteId_partIndex_key" ON "AiNoteSummaryPart"("noteId", "partIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AiNoteJob_noteId_key" ON "AiNoteJob"("noteId");

-- CreateIndex
CREATE INDEX "AiNoteJob_userId_updatedAt_idx" ON "AiNoteJob"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AiNoteTranscript" ADD CONSTRAINT "AiNoteTranscript_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AiNoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiNoteSummaryPart" ADD CONSTRAINT "AiNoteSummaryPart_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AiNoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiNoteJob" ADD CONSTRAINT "AiNoteJob_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AiNoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AiNoteSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNoteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNoteChunk" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNoteChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiNoteSession_userId_createdAt_idx" ON "AiNoteSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiNoteChunk_noteId_idx" ON "AiNoteChunk"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "AiNoteChunk_noteId_chunkIndex_key" ON "AiNoteChunk"("noteId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "AiNoteChunk" ADD CONSTRAINT "AiNoteChunk_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AiNoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

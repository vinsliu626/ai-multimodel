const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const out = {};
  try { out.summaryPart = await p.aiNoteSummaryPart.deleteMany({}); } catch (e) { out.summaryPartErr = e.message; }
  try { out.transcript = await p.aiNoteTranscript.deleteMany({}); } catch (e) { out.transcriptErr = e.message; }
  try { out.chunk = await p.aiNoteChunk.deleteMany({}); } catch (e) { out.chunkErr = e.message; }
  try { out.job = await p.aiNoteJob.deleteMany({}); } catch (e) { out.jobErr = e.message; }
  try { out.session = await p.aiNoteSession.deleteMany({}); } catch (e) { out.sessionErr = e.message; }
  console.log(JSON.stringify(out));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});

CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'ACTIVE', 'QUESTION_ACTIVE', 'BETWEEN_QUESTIONS', 'FINISHED', 'CLOSED');
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "Quiz" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "optionA" TEXT NOT NULL,
  "optionB" TEXT NOT NULL,
  "optionC" TEXT NOT NULL,
  "optionD" TEXT NOT NULL,
  "correctOption" TEXT NOT NULL,
  "timeLimit" INTEGER NOT NULL DEFAULT 20,
  "basePoints" INTEGER NOT NULL DEFAULT 100,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "roomCode" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
  "currentQuestion" INTEGER NOT NULL DEFAULT 0,
  "questionStartedAt" TIMESTAMP(3),
  "questionEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Participant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Answer" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedOption" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responseTime" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "score" INTEGER NOT NULL,
  CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Result" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "correctAnswers" INTEGER NOT NULL,
  "totalTime" INTEGER NOT NULL,
  "rank" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Question_quizId_order_key" ON "Question"("quizId", "order");
CREATE INDEX "Question_quizId_idx" ON "Question"("quizId");
CREATE UNIQUE INDEX "Room_roomCode_key" ON "Room"("roomCode");
CREATE INDEX "Room_quizId_idx" ON "Room"("quizId");
CREATE UNIQUE INDEX "Participant_roomId_sessionId_key" ON "Participant"("roomId", "sessionId");
CREATE INDEX "Participant_roomId_idx" ON "Participant"("roomId");
CREATE UNIQUE INDEX "Answer_participantId_questionId_key" ON "Answer"("participantId", "questionId");
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");
CREATE UNIQUE INDEX "Result_participantId_key" ON "Result"("participantId");
CREATE INDEX "Result_roomId_rank_idx" ON "Result"("roomId", "rank");

ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

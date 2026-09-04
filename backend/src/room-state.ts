import type { PrismaClient } from "@prisma/client";

export async function getLeaderboard(prisma: PrismaClient, roomId: string) {
  const participants = await prisma.participant.findMany({
    where: { roomId },
    include: { answers: true },
    orderBy: { createdAt: "asc" }
  });

  return participants
    .map((participant) => {
      const totalScore = participant.answers.reduce((sum, answer) => sum + answer.score, 0);
      const correctAnswers = participant.answers.filter((answer) => answer.isCorrect).length;
      const totalTime = participant.answers
        .filter((answer) => answer.isCorrect)
        .reduce((sum, answer) => sum + answer.responseTime, 0);
      return {
        participantId: participant.id,
        name: participant.name,
        totalScore,
        correctAnswers,
        totalTime
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || a.totalTime - b.totalTime || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function persistResults(prisma: PrismaClient, roomId: string) {
  const leaderboard = await getLeaderboard(prisma, roomId);
  await prisma.$transaction(
    leaderboard.map((entry) =>
      prisma.result.upsert({
        where: { participantId: entry.participantId },
        update: {
          totalScore: entry.totalScore,
          correctAnswers: entry.correctAnswers,
          totalTime: entry.totalTime,
          rank: entry.rank
        },
        create: {
          roomId,
          participantId: entry.participantId,
          totalScore: entry.totalScore,
          correctAnswers: entry.correctAnswers,
          totalTime: entry.totalTime,
          rank: entry.rank
        }
      })
    )
  );
  return leaderboard;
}

export async function getPublicRoomState(prisma: PrismaClient, roomId: string, participantId?: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      quiz: { include: { questions: { orderBy: { order: "asc" } } } },
      participants: { select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } }
    }
  });

  if (!room) return null;
  const currentQuestion = room.quiz.questions.find((question) => question.order === room.currentQuestion);
  const ownAnswer =
    participantId && currentQuestion
      ? await prisma.answer.findUnique({
          where: { participantId_questionId: { participantId, questionId: currentQuestion.id } }
        })
      : null;

  return {
    serverTime: new Date().toISOString(),
    room: {
      id: room.id,
      roomCode: room.roomCode,
      status: room.status,
      currentQuestion: room.currentQuestion,
      questionStartedAt: room.questionStartedAt?.toISOString() ?? null,
      questionEndsAt: room.questionEndsAt?.toISOString() ?? null,
      participantCount: room.participants.length
    },
    quiz: {
      id: room.quiz.id,
      title: room.quiz.title,
      questionCount: room.quiz.questions.length
    },
    participants: room.participants,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          order: currentQuestion.order,
          text: currentQuestion.text,
          optionA: currentQuestion.optionA,
          optionB: currentQuestion.optionB,
          optionC: currentQuestion.optionC,
          optionD: currentQuestion.optionD,
          timeLimit: currentQuestion.timeLimit,
          basePoints: currentQuestion.basePoints
        }
      : null,
    alreadyAnswered: Boolean(ownAnswer)
  };
}

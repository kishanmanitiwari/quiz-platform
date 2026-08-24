import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const questions = [
  ["Who is the founder-acharya of ISKCON?", "A. C. Bhaktivedanta Swami Prabhupada", "Bhaktisiddhanta Sarasvati", "Rupa Goswami", "Madhvacharya", "A"],
  ["What does ISKCON stand for?", "International Society for Krishna Consciousness", "Indian Society for Kirtan", "Institute of Sanskrit Knowledge", "International Sankirtan Council", "A"],
  ["Which scripture contains Krishna's instructions to Arjuna?", "Srimad Bhagavatam", "Bhagavad Gita", "Chaitanya Charitamrita", "Isha Upanishad", "B"],
  ["Which mantra is widely chanted by ISKCON devotees?", "Gayatri Mantra", "Hare Krishna Mahamantra", "Om Namah Shivaya", "Mahamrityunjaya Mantra", "B"],
  ["In which city was ISKCON incorporated in 1966?", "London", "Mumbai", "New York City", "Vrindavan", "C"],
  ["Which festival celebrates Lord Krishna's appearance day?", "Gaura Purnima", "Rama Navami", "Janmashtami", "Narasimha Chaturdashi", "C"]
] as const;

async function main() {
  const quiz = await prisma.quiz.upsert({
    where: { id: "sample-iskcon-quiz" },
    update: { title: "ISKCON Event Quiz", status: "PUBLISHED" },
    create: { id: "sample-iskcon-quiz", title: "ISKCON Event Quiz", status: "PUBLISHED" }
  });

  for (const [index, q] of questions.entries()) {
    await prisma.question.upsert({
      where: { quizId_order: { quizId: quiz.id, order: index + 1 } },
      update: {
        text: q[0],
        optionA: q[1],
        optionB: q[2],
        optionC: q[3],
        optionD: q[4],
        correctOption: q[5],
        timeLimit: 20,
        basePoints: 100
      },
      create: {
        quizId: quiz.id,
        order: index + 1,
        text: q[0],
        optionA: q[1],
        optionB: q[2],
        optionC: q[3],
        optionD: q[4],
        correctOption: q[5],
        timeLimit: 20,
        basePoints: 100
      }
    });
  }

  console.log(`Seeded quiz: ${quiz.id}`);
}

main().finally(async () => prisma.$disconnect());

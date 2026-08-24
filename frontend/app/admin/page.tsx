"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Quiz = { id: string; title: string; questions: unknown[]; rooms: { id: string; roomCode: string; status: string }[] };

export default function AdminPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [title, setTitle] = useState("ISKCON Event Quiz");
  const [error, setError] = useState("");

  async function load() {
    try {
      const body = await apiFetch<{ quizzes: Quiz[] }>("/api/admin/quizzes");
      setQuizzes(body.quizzes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quizzes");
    }
  }

  async function createQuiz() {
    const body = await apiFetch<{ quiz: Quiz }>("/api/admin/quizzes", { method: "POST", body: JSON.stringify({ title }) });
    window.location.href = `/admin/quiz/${body.quiz.id}`;
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">Admin</h1>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input className="focus-ring flex-1 rounded-md border border-slate-300 bg-white px-4 py-3" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 font-semibold text-white" onClick={createQuiz}>
            <Plus size={18} /> Create quiz
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-8 grid gap-3">
          {quizzes.map((quiz) => (
            <Link key={quiz.id} className="rounded-md border border-slate-200 bg-white p-4" href={`/admin/quiz/${quiz.id}`}>
              <p className="font-semibold">{quiz.title}</p>
              <p className="mt-1 text-sm text-slate-600">{quiz.questions.length}/6 questions, {quiz.rooms.length} rooms</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

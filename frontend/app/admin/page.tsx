"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { Plus, Search, BookOpen, Layers, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Quiz = {
  id: string;
  title: string;
  questions: unknown[];
  rooms: { id: string; roomCode: string; status: string }[];
};

export default function AdminPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [title, setTitle] = useState("ISKCON Event Quiz");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    try {
      const body = await apiFetch<{ quizzes: Quiz[] }>("/api/admin/quizzes");
      setQuizzes(body.quizzes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quizzes");
    }
  }

  async function createQuiz() {
    if (!title.trim()) return;
    setIsLoading(true);
    try {
      const body = await apiFetch<{ quiz: Quiz }>("/api/admin/quizzes", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      window.location.href = `/admin/quiz/${body.quiz.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create quiz");
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Filter quizzes based on search query
  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((quiz) =>
      quiz.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [quizzes, searchQuery]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-leaf mb-2">
              Control Panel
            </span>
            <h1 className="text-3xl font-black text-slate-900">
              Quiz Management
            </h1>
          </div>
        </div>

        {/* Create Quiz Card */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-3">
            Create New Quiz Session
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="focus-ring flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-leaf shadow-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter quiz title..."
            />
            <button
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-leaf px-6 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              onClick={createQuiz}
              disabled={isLoading || !title.trim()}
            >
              <Plus size={18} /> {isLoading ? "Creating..." : "Create Quiz"}
            </button>
          </div>
        </div>

        {/* Available Quizzes Header & Search Bar */}
        <div className="mt-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold text-slate-900">
            Available Quizzes ({filteredQuizzes.length})
          </h2>

          <div className="relative w-full sm:w-72">
            <Search
              className="absolute left-3.5 top-3.5 text-slate-400"
              size={18}
            />
            <input
              type="text"
              className="focus-ring w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-leaf shadow-sm"
              placeholder="Search available quiz..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
          </div>
        )}

        {/* Quizzes List */}
        <div className="mt-4 grid gap-4">
          {filteredQuizzes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-slate-500 font-medium">No quizzes found.</p>
            </div>
          ) : (
            filteredQuizzes.map((quiz) => (
              <Link
                key={quiz.id}
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-leaf hover:shadow-md"
                href={`/admin/quiz/${quiz.id}`}
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-leaf transition-colors">
                    {quiz.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md">
                      <BookOpen size={14} className="text-slate-600" />{" "}
                      {quiz.questions.length} Questions
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md">
                      <Layers size={14} className="text-slate-600" />{" "}
                      {quiz.rooms.length} Rooms
                    </span>
                  </div>
                </div>

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-leaf transition-colors">
                  <ArrowRight size={18} />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Play, BookOpen, Layers, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Quiz = {
  id: string;
  title: string;
  questions: unknown[];
  rooms: { id: string; roomCode: string; status: string }[];
};

export default function AdminPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // State to manage which view the user is looking at
  const [activeAction, setActiveAction] = useState<"create" | "start">("start");
  const [selectedQuizId, setSelectedQuizId] = useState<string>("");

  async function load() {
    try {
      const body = await apiFetch<{ quizzes: Quiz[] }>("/api/admin/quizzes");
      setQuizzes(body.quizzes);
      if (body.quizzes.length > 0) {
        setSelectedQuizId(body.quizzes[0].id);
      }
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

  const selectedQuiz = quizzes.find((q) => q.id === selectedQuizId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-leaf mb-2">
            Control Panel
          </span>
          <h1 className="text-3xl font-black text-slate-900">
            Quiz Management
          </h1>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
          </div>
        )}

        {/* Action Toggle Buttons */}
        <div className="flex gap-4 mb-8 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          <button
            onClick={() => setActiveAction("create")}
            className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
              activeAction === "create"
                ? "bg-leaf text-white shadow-md"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            Create Quiz
          </button>
          <button
            onClick={() => setActiveAction("start")}
            className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
              activeAction === "start"
                ? "bg-leaf text-white shadow-md"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            Start Quiz
          </button>
        </div>

        {/* Create Quiz View */}
        {activeAction === "create" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Create New Quiz
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row">
              <input
                className="focus-ring flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-leaf shadow-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter name of quiz..."
              />
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-leaf px-8 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                onClick={createQuiz}
                disabled={isLoading || !title.trim()}
              >
                <Plus size={18} /> {isLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Start Quiz View */}
        {activeAction === "start" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Select an Available Quiz
            </h2>

            {quizzes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-slate-500 font-medium">
                  No quizzes available yet.
                </p>
                <button
                  onClick={() => setActiveAction("create")}
                  className="mt-3 text-leaf font-bold hover:underline"
                >
                  Create one now
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="relative">
                  <select
                    value={selectedQuizId}
                    onChange={(e) => setSelectedQuizId(e.target.value)}
                    className="w-full focus-ring rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-12 text-slate-900 outline-none transition-all focus:border-leaf shadow-sm appearance-none font-medium cursor-pointer"
                  >
                    <option value="" disabled>
                      Select a quiz...
                    </option>
                    {quizzes.map((quiz) => (
                      <option key={quiz.id} value={quiz.id}>
                        {quiz.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    size={20}
                  />
                </div>

                {selectedQuiz && (
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <BookOpen size={16} /> {selectedQuiz.questions.length}{" "}
                      Questions
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <Layers size={16} /> {selectedQuiz.rooms.length} Sessions
                    </span>
                  </div>
                )}

                <Link
                  href={`/admin/quiz/${selectedQuizId}`}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 font-bold text-white shadow-sm transition-all ${
                    selectedQuizId
                      ? "bg-leaf hover:opacity-90 active:scale-[0.98]"
                      : "bg-slate-300 cursor-not-allowed pointer-events-none"
                  }`}
                >
                  <Play size={18} fill="currentColor" /> Play Quiz
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

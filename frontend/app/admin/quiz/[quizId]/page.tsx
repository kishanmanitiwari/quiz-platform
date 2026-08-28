"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Plus, Save, Play, ArrowLeft, ArrowRight } from "lucide-react";

type Question = {
  order: number;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  timeLimit: number;
  basePoints: number;
};

type Quiz = {
  id: string;
  title: string;
  totalQuestions?: number;
  questions: Question[];
};

const blank = (order: number): Question => ({
  order,
  text: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A",
  timeLimit: 20,
  basePoints: 100,
});

export default function QuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number>(6);
  const [selected, setSelected] = useState(1);
  const [form, setForm] = useState<Question>(blank(1));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const body = await apiFetch<{ quiz: Quiz }>(`/api/admin/quizzes/${quizId}`);
    setQuiz(body.quiz);
    const count = body.quiz.totalQuestions || body.quiz.questions.length || 6;
    setTotalQuestions(count);
    const first =
      body.quiz.questions.find((q) => q.order === selected) ?? blank(selected);
    setForm(first);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const q =
      quiz?.questions.find((item) => item.order === selected) ??
      blank(selected);
    setForm(q);
  }, [selected, quiz]);

  async function saveQuestion() {
    setIsSaving(true);
    setMessage("");
    try {
      await apiFetch(`/api/admin/quizzes/${quizId}/questions/${selected}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });

      await load();

      if (selected < totalQuestions) {
        setSelected((prev) => prev + 1);
        setMessage(""); // Clear message when moving to the next tab
      } else {
        setMessage("Quiz saved successfully!");
      }
    } catch (err) {
      setMessage("Failed to save question");
    } finally {
      setIsSaving(false);
    }
  }

  async function createRoom() {
    const body = await apiFetch<{ room: { id: string } }>("/api/admin/rooms", {
      method: "POST",
      body: JSON.stringify({ quizId }),
    });
    window.location.href = `/admin/room/${body.room.id}`;
  }

  if (!quiz)
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 p-6">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <span className="font-medium text-slate-500">
          Loading quiz details...
        </span>
      </main>
    );

  // Count how many questions have actually been saved/configured in backend
  const configuredCount = quiz.questions.length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf hover:underline"
        >
          <ArrowLeft size={16} /> Back to admin
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{quiz.title}</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {configuredCount}/{totalQuestions} questions configured
            </p>
          </div>

          <button
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-leaf px-6 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
            disabled={configuredCount < totalQuestions}
            onClick={createRoom}
          >
            <Play size={18} /> Start Quiz Session
          </button>
        </div>

        {/* Dynamic Question Count Selector (6 to 50) */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label className="text-sm font-bold text-slate-800">
              Total Questions for this Quiz
            </label>
            <p className="text-xs text-slate-500">
              Choose between 6 to 50 questions.
            </p>
          </div>
          <select
            className="focus-ring rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-leaf"
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(Number(e.target.value))}
          >
            {Array.from({ length: 45 }, (_, i) => i + 6).map((num) => (
              <option key={num} value={num}>
                {num} Questions
              </option>
            ))}
          </select>
        </div>

        {/* Question Selector Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 overflow-x-auto pb-2">
          {Array.from({ length: totalQuestions }, (_, i) => i + 1).map(
            (order) => {
              const isSaved = quiz.questions.some((q) => q.order === order);
              return (
                <button
                  key={order}
                  onClick={() => setSelected(order)}
                  className={`focus-ring relative flex h-11 w-11 items-center justify-center rounded-xl font-bold text-sm transition-all ${
                    selected === order
                      ? "bg-slate-900 text-white shadow-md scale-105"
                      : isSaved
                        ? "bg-emerald-50 text-leaf border border-emerald-200"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {order}
                </button>
              );
            },
          )}
        </div>

        {/* Question Form Editor */}
        <div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-extrabold text-slate-900">
              Editing Question #{selected}
            </h2>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              Question Text
            </label>
            <textarea
              className="focus-ring min-h-[100px] w-full rounded-xl border border-slate-300 bg-white p-3.5 text-slate-900 outline-none focus:border-leaf"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Type the question here..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(["optionA", "optionB", "optionC", "optionD"] as const).map(
              (field, index) => {
                const letter = String.fromCharCode(65 + index);
                return (
                  <div key={field}>
                    <label className="block text-sm font-bold text-slate-800 mb-1.5">
                      Option {letter}
                    </label>
                    <input
                      className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:border-leaf"
                      value={form[field]}
                      onChange={(e) =>
                        setForm({ ...form, [field]: e.target.value })
                      }
                      placeholder={`Enter option ${letter}`}
                    />
                  </div>
                );
              },
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                Correct Option
              </label>
              <select
                className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:border-leaf font-semibold"
                value={form.correctOption}
                onChange={(e) =>
                  setForm({ ...form, correctOption: e.target.value })
                }
              >
                {["A", "B", "C", "D"].map((x) => (
                  <option key={x} value={x}>
                    Option {x}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                Time Limit (Seconds)
              </label>
              <input
                className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:border-leaf font-semibold"
                type="number"
                value={form.timeLimit}
                onChange={(e) =>
                  setForm({ ...form, timeLimit: Number(e.target.value) })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                Base Points
              </label>
              <input
                className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:border-leaf font-semibold"
                type="number"
                value={form.basePoints}
                onChange={(e) =>
                  setForm({ ...form, basePoints: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            {message ? (
              <p className="text-sm font-bold text-leaf">{message}</p>
            ) : (
              <span />
            )}
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-saffron px-6 py-3 font-bold text-ink shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
              onClick={saveQuestion}
              disabled={isSaving}
            >
              {selected < totalQuestions ? (
                <>
                  {isSaving ? "Saving..." : "Next"} <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <Save size={18} /> {isSaving ? "Saving..." : "Save Quiz"}
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

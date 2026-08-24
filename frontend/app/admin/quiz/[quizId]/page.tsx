"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

type Quiz = { id: string; title: string; questions: Question[]; rooms: { id: string; roomCode: string; status: string }[] };

const blank = (order: number): Question => ({
  order,
  text: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "A",
  timeLimit: 20,
  basePoints: 100
});

export default function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [selected, setSelected] = useState(1);
  const [form, setForm] = useState<Question>(blank(1));
  const [message, setMessage] = useState("");

  async function load() {
    const body = await apiFetch<{ quiz: Quiz }>(`/api/admin/quizzes/${quizId}`);
    setQuiz(body.quiz);
    const first = body.quiz.questions.find((q) => q.order === selected) ?? blank(selected);
    setForm(first);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const q = quiz?.questions.find((item) => item.order === selected) ?? blank(selected);
    setForm(q);
  }, [selected, quiz]);

  async function saveQuestion() {
    await apiFetch(`/api/admin/quizzes/${quizId}/questions/${selected}`, { method: "PUT", body: JSON.stringify(form) });
    setMessage("Question saved");
    await load();
  }

  async function createRoom() {
    const body = await apiFetch<{ room: { id: string } }>("/api/admin/rooms", { method: "POST", body: JSON.stringify({ quizId }) });
    window.location.href = `/admin/room/${body.room.id}`;
  }

  if (!quiz) return <main className="p-6">Loading...</main>;

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-semibold text-leaf">Back to admin</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">{quiz.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{quiz.questions.length}/6 questions configured</p>
          </div>
          <button className="focus-ring rounded-md bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={quiz.questions.length !== 6} onClick={createRoom}>
            Create room
          </button>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((order) => (
            <button key={order} onClick={() => setSelected(order)} className={`focus-ring h-10 w-10 rounded-md font-semibold ${selected === order ? "bg-ink text-white" : "bg-white"}`}>
              {order}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 rounded-md border border-slate-200 bg-white p-4">
          <label className="text-sm font-semibold">Question text</label>
          <textarea className="focus-ring min-h-24 rounded-md border border-slate-300 px-3 py-2" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          {(["optionA", "optionB", "optionC", "optionD"] as const).map((field, index) => (
            <label key={field} className="text-sm font-semibold">
              Option {String.fromCharCode(65 + index)}
              <input className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
            </label>
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">Correct option
              <select className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.correctOption} onChange={(e) => setForm({ ...form, correctOption: e.target.value })}>
                {["A", "B", "C", "D"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Time limit
              <input className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })} />
            </label>
            <label className="text-sm font-semibold">Base points
              <input className="focus-ring mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" value={form.basePoints} onChange={(e) => setForm({ ...form, basePoints: Number(e.target.value) })} />
            </label>
          </div>
          <button className="focus-ring rounded-md bg-saffron px-4 py-3 font-semibold text-ink" onClick={saveQuestion}>Save question</button>
          {message && <p className="text-sm text-leaf">{message}</p>}
        </div>
        <div className="mt-8 grid gap-3">
          {quiz.rooms.map((room) => (
            <Link key={room.id} className="rounded-md border border-slate-200 bg-white p-4" href={`/admin/room/${room.id}`}>
              Room {room.roomCode} - {room.status}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

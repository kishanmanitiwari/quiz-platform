"use client";

import { use, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/config";
import { getSessionId, participantKey } from "@/lib/session";

type State = {
  room: { id: string; roomCode: string; status: string; currentQuestion: number; questionEndsAt: string | null; participantCount: number };
  quiz: { title: string; questionCount: number };
  currentQuestion: null | {
    id: string;
    order: number;
    text: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    timeLimit: number;
  };
  alreadyAnswered: boolean;
};

export default function JoinPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode: rawRoomCode } = use(params);
  const roomCode = rawRoomCode.toUpperCase();
  const [name, setName] = useState("");
  const [participant, setParticipant] = useState<{ id: string; name: string; sessionId: string } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [message, setMessage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(participantKey(roomCode));
    if (saved) setParticipant(JSON.parse(saved));
  }, [roomCode]);

  useEffect(() => {
    if (!participant) return;
    const client = io(SOCKET_URL, { transports: ["websocket"] });
    const payload = { roomCode, participantId: participant.id, sessionId: participant.sessionId };
    client.emit("participant:reconnect", payload, (ack: { ok: boolean; state?: State; error?: string }) => {
      if (ack.ok && ack.state) setState(ack.state);
      if (!ack.ok) setMessage(ack.error ?? "Reconnect failed");
    });
    client.on("room:state", setState);
    client.on("question:start", setState);
    client.on("question:end", ({ leaderboard }) => setMessage(`Leaderboard updated. Top score: ${leaderboard?.[0]?.totalScore ?? 0}`));
    client.on("quiz:finish", ({ leaderboard }) => {
      setMessage(`Final rank: ${leaderboard?.find((x: any) => x.participantId === participant.id)?.rank ?? "-"}`);
      fetch(`${API_URL}/api/participants/${participant.id}/result`).then(async (res) => {
        if (res.ok) setState((current) => (current ? { ...current, room: { ...current.room, status: "FINISHED" } } : current));
      });
    });
    setSocket(client);
    return () => {
      client.close();
    };
  }, [participant, roomCode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!state?.room.questionEndsAt) return setSecondsLeft(0);
      setSecondsLeft(Math.max(0, Math.ceil((new Date(state.room.questionEndsAt).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [state?.room.questionEndsAt]);

  const options = useMemo(() => {
    const q = state?.currentQuestion;
    return q ? [["A", q.optionA], ["B", q.optionB], ["C", q.optionC], ["D", q.optionD]] : [];
  }, [state?.currentQuestion]);

  async function join() {
    setMessage("");
    const sessionId = getSessionId();
    const res = await fetch(`${API_URL}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, name, sessionId })
    });
    const body = await res.json();
    if (!res.ok) return setMessage(body.error ?? "Could not join room");
    const saved = { id: body.participant.id, name: body.participant.name, sessionId };
    localStorage.setItem(participantKey(roomCode), JSON.stringify(saved));
    setParticipant(saved);
    setState(body.state);
  }

  function answer(selectedOption: string) {
    if (!socket || !participant || !state?.currentQuestion) return;
    socket.emit(
      "answer:submit",
      { roomCode, participantId: participant.id, sessionId: participant.sessionId, questionId: state.currentQuestion.id, selectedOption },
      (ack: { ok: boolean; error?: string }) => {
        setMessage(ack.ok ? "Answer submitted. Waiting for next question..." : ack.error ?? "Answer rejected");
        if (ack.ok) setState((current) => (current ? { ...current, alreadyAnswered: true } : current));
      }
    );
  }

  if (!participant) {
    return (
      <main className="min-h-screen px-4 py-8">
        <section className="mx-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-wide text-leaf">Room {roomCode}</p>
          <h1 className="mt-2 text-3xl font-bold">ISKCON Event Quiz</h1>
          <label className="mt-8 block text-sm font-semibold">Your name</label>
          <input className="focus-ring mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button className="focus-ring mt-4 w-full rounded-md bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={!name.trim()} onClick={join}>
            Join Quiz
          </button>
          {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
        </section>
      </main>
    );
  }

  if (!state) return <main className="p-6">Connecting...</main>;

  if (state.room.status === "QUESTION_ACTIVE" && state.currentQuestion) {
    return (
      <main className="min-h-screen px-4 py-6">
        <section className="mx-auto max-w-xl">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Question {state.currentQuestion.order}/{state.quiz.questionCount}</span>
            <span>{secondsLeft}s</span>
          </div>
          <h1 className="mt-5 text-2xl font-bold">{state.currentQuestion.text}</h1>
          <div className="mt-6 grid gap-3">
            {options.map(([key, label]) => (
              <button key={key} disabled={state.alreadyAnswered} onClick={() => answer(key)} className="focus-ring rounded-md border border-slate-300 bg-white p-4 text-left font-semibold disabled:opacity-60">
                <span className="mr-2 text-leaf">{key}.</span>{label}
              </button>
            ))}
          </div>
          {state.alreadyAnswered && <p className="mt-5 rounded-md bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">Answer submitted. Waiting for next question...</p>}
          {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-md">
        <p className="text-sm font-semibold uppercase tracking-wide text-leaf">{participant.name}</p>
        <h1 className="mt-2 text-3xl font-bold">{state.quiz.title}</h1>
        <div className="mt-8 rounded-md border border-slate-200 bg-white p-5">
          <p className="font-semibold">Room {roomCode}</p>
          <p className="mt-2 text-slate-700">{state.room.status === "FINISHED" ? "Quiz finished." : "Waiting for quiz to start..."}</p>
          <p className="mt-4 text-sm text-slate-600">{state.room.participantCount} participants joined</p>
        </div>
        {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
      </section>
    </main>
  );
}

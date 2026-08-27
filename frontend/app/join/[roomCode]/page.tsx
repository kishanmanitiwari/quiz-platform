"use client";

import { use, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/config";
import { getSessionId, participantKey } from "@/lib/session";

type State = {
  room: {
    id: string;
    roomCode: string;
    status: string;
    currentQuestion: number;
    questionEndsAt: string | null;
    participantCount: number;
  };
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

export default function JoinPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode: rawRoomCode } = use(params);
  const roomCode = rawRoomCode.toUpperCase();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hasJoinedWa, setHasJoinedWa] = useState(false);

  const [participant, setParticipant] = useState<{
    id: string;
    name: string;
    sessionId: string;
  } | null>(null);
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
    const payload = {
      roomCode,
      participantId: participant.id,
      sessionId: participant.sessionId,
    };
    client.emit(
      "participant:reconnect",
      payload,
      (ack: { ok: boolean; state?: State; error?: string }) => {
        if (ack.ok && ack.state) setState(ack.state);
        if (!ack.ok) setMessage(ack.error ?? "Reconnect failed");
      },
    );
    client.on("room:state", setState);
    client.on("question:start", setState);
    client.on("question:end", ({ leaderboard }) =>
      setMessage(
        `Leaderboard updated. Top score: ${leaderboard?.[0]?.totalScore ?? 0}`,
      ),
    );
    client.on("quiz:finish", ({ leaderboard }) => {
      setMessage(
        `Final rank: ${leaderboard?.find((x: any) => x.participantId === participant.id)?.rank ?? "-"}`,
      );
      fetch(`${API_URL}/api/participants/${participant.id}/result`).then(
        async (res) => {
          if (res.ok)
            setState((current) =>
              current
                ? { ...current, room: { ...current.room, status: "FINISHED" } }
                : current,
            );
        },
      );
    });
    setSocket(client);
    return () => {
      client.close();
    };
  }, [participant, roomCode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!state?.room.questionEndsAt) return setSecondsLeft(0);
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil(
            (new Date(state.room.questionEndsAt).getTime() - Date.now()) / 1000,
          ),
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [state?.room.questionEndsAt]);

  const options = useMemo(() => {
    const q = state?.currentQuestion;
    return q
      ? [
          ["A", q.optionA],
          ["B", q.optionB],
          ["C", q.optionC],
          ["D", q.optionD],
        ]
      : [];
  }, [state?.currentQuestion]);

  async function join() {
    setMessage("");
    const sessionId = getSessionId();

    try {
      const res = await fetch(`${API_URL}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, name, phone, sessionId }),
      });

      const body = await res.json();

      if (!res.ok) {
        const errString = String(body.error || "").toLowerCase();
        if (
          errString.includes("unique") ||
          errString.includes("already") ||
          errString.includes("p2002")
        ) {
          return setMessage(
            "You have already joined or played this quiz with this WhatsApp number!",
          );
        }
        return setMessage(body.error ?? "Could not join room");
      }

      const saved = {
        id: body.participant.id,
        name: body.participant.name,
        sessionId,
      };
      localStorage.setItem(participantKey(roomCode), JSON.stringify(saved));
      setParticipant(saved);
      setState(body.state);
    } catch (err) {
      setMessage("Network error. Please try again.");
    }
  }

  function answer(selectedOption: string) {
    if (!socket || !participant || !state?.currentQuestion) return;
    socket.emit(
      "answer:submit",
      {
        roomCode,
        participantId: participant.id,
        sessionId: participant.sessionId,
        questionId: state.currentQuestion.id,
        selectedOption,
      },
      (ack: { ok: boolean; error?: string }) => {
        setMessage(
          ack.ok
            ? "Answer submitted. Waiting for next question..."
            : (ack.error ?? "Answer rejected"),
        );
        if (ack.ok)
          setState((current) =>
            current ? { ...current, alreadyAnswered: true } : current,
          );
      },
    );
  }

  // --- JOIN SCREEN (Unregistered User) ---
  if (!participant) {
    return (
      <main className="min-h-screen bg-[#FFF9F2] px-4 py-8 flex flex-col items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border border-orange-100 bg-white p-8 shadow-xl shadow-orange-100/50">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-orange-600 mb-2">
              Hare Krishna! 🙏
            </h1>
            <p className="text-sm font-bold uppercase tracking-wider text-orange-400">
              ISKCON Event Quiz • Room {roomCode}
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Your Good Name
              </label>
              <input
                className="w-full rounded-xl border border-orange-200 bg-orange-50/30 px-4 py-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                WhatsApp Number
              </label>
              <input
                type="tel"
                className="w-full rounded-xl border border-orange-200 bg-orange-50/30 px-4 py-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit WhatsApp number"
              />
              <p className="mt-2 text-xs font-medium text-orange-600/80">
                * Results, prasadam coupons, and memories will be shared here.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="mb-4 text-center text-sm font-semibold text-emerald-900">
                Join our spiritual community to participate
              </p>
              <a
                href="https://chat.whatsapp.com/YOUR_INVITE_LINK_HERE"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg"
              >
                💬 Step 1: Join WhatsApp Group
              </a>

              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-600"
                  checked={hasJoinedWa}
                  onChange={(e) => setHasJoinedWa(e.target.checked)}
                />
                <span className="text-sm font-semibold text-emerald-900">
                  Step 2: I confirm I have joined the ISKCON WhatsApp Community.
                </span>
              </label>
            </div>

            <button
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:opacity-90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              disabled={!name.trim() || phone.length !== 10 || !hasJoinedWa}
              onClick={join}
            >
              Enter Quiz
            </button>

            {message && (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-center border border-red-100">
                <p className="text-sm font-semibold text-red-600">{message}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  // --- LOADING SCREEN ---
  if (!state)
    return (
      <main className="min-h-screen bg-[#FFF9F2] flex items-center justify-center">
        <p className="text-lg font-semibold text-orange-600 animate-pulse">
          Connecting... 🙏
        </p>
      </main>
    );

  // --- ACTIVE QUESTION SCREEN ---
  if (state.room.status === "QUESTION_ACTIVE" && state.currentQuestion) {
    return (
      <main className="min-h-screen bg-[#FFF9F2] px-4 py-8">
        <section className="mx-auto max-w-xl">
          <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-orange-100 mb-6">
            <span className="text-sm font-bold uppercase text-orange-500 tracking-wider">
              Question {state.currentQuestion.order}/{state.quiz.questionCount}
            </span>
            <span className="flex items-center justify-center bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full font-bold">
              ⏱ {secondsLeft}s
            </span>
          </div>

          <div className="rounded-2xl bg-white p-6 md:p-8 shadow-md border border-orange-100">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 leading-snug">
              {state.currentQuestion.text}
            </h1>
          </div>

          <div className="mt-6 grid gap-4">
            {options.map(([key, label]) => (
              <button
                key={key}
                disabled={state.alreadyAnswered}
                onClick={() => answer(key)}
                className="group relative flex w-full items-center rounded-xl border-2 border-orange-100 bg-white p-5 text-left font-semibold text-slate-700 transition-all hover:border-orange-400 hover:bg-orange-50 disabled:opacity-60 disabled:hover:border-orange-100 disabled:hover:bg-white"
              >
                <span className="mr-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-bold group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  {key}
                </span>
                <span className="text-lg">{label}</span>
              </button>
            ))}
          </div>

          {state.alreadyAnswered && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
              <p className="font-semibold text-emerald-800">
                Hari Bol! Answer submitted. Waiting for the next question...
              </p>
            </div>
          )}
          {message && !state.alreadyAnswered && (
            <p className="mt-6 text-center text-sm font-medium text-slate-600">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  // --- WAITING / FINISHED SCREEN ---
  return (
    <main className="min-h-screen bg-[#FFF9F2] px-4 py-12 flex flex-col items-center">
      <section className="w-full max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-orange-400 mb-2">
          Participant: {participant.name}
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800">
          {state.quiz.title}
        </h1>

        <div className="mt-10 rounded-3xl border border-orange-100 bg-white p-8 shadow-xl shadow-orange-100/50">
          {state.room.status === "FINISHED" ? (
            <>
              <h2 className="text-4xl mb-4 text-orange-500">🙏</h2>
              <h2 className="text-2xl font-bold text-orange-600 mb-3">
                Dhanyawaad!
              </h2>
              <p className="text-lg font-medium text-slate-600">
                Haribol! The quiz has successfully concluded. Please look at the
                main screen for the final results.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-6"></div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">
                Room {roomCode}
              </h2>
              <p className="text-md font-medium text-slate-600">
                Please wait patiently. The transcendental quiz will begin
                shortly...
              </p>
            </>
          )}

          <div className="mt-8 inline-block rounded-full bg-orange-50 border border-orange-100 px-5 py-2 text-sm font-bold text-orange-600">
            👥 {state.room.participantCount} Devotees Joined
          </div>
        </div>

        {message && (
          <p className="mt-6 text-sm font-medium text-slate-600">{message}</p>
        )}
      </section>
    </main>
  );
}

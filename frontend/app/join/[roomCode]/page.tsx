"use client";

import { use, useEffect, useMemo, useState, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { Loader2 } from "lucide-react";
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

  // NEW: UI Safety Locks
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. SESSION RECOVERY (Runs on initial load to prevent accidental refresh drops)
  useEffect(() => {
    const saved = localStorage.getItem(participantKey(roomCode));
    if (saved) setParticipant(JSON.parse(saved));
  }, [roomCode]);

  // 2. SOCKET RECONNECTION LOGIC
  useEffect(() => {
    if (!participant) return;
    const client = io(SOCKET_URL, { transports: ["websocket"] });

    const payload = {
      roomCode,
      participantId: participant.id,
      sessionId: participant.sessionId,
    };

    // Wrapped in a connect listener to automatically handle Wi-Fi drops and reconnects
    const joinRoom = () => {
      client.emit(
        "participant:reconnect",
        payload,
        (ack: { ok: boolean; state?: State; error?: string }) => {
          if (ack.ok && ack.state) setState(ack.state);
          if (!ack.ok) setMessage(ack.error ?? "Reconnect failed");
        },
      );
    };

    client.on("connect", joinRoom);
    client.on("room:state", setState);
    client.on("question:start", (newState) => {
      setState(newState);
      setIsSubmitting(false); // Unlock buttons when a new question starts
    });

    client.on("question:end", ({ leaderboard }) => {
      setMessage(
        `Leaderboard updated. Top score: ${leaderboard?.[0]?.totalScore ?? 0}`,
      );
    });

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

  // 3. PERFECT TIMER SYNC (Immune to device lag)
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
    if (isJoining) return;
    setIsJoining(true);
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
        setIsJoining(false);
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
      setIsJoining(false);
      setMessage("Network error. Please try again.");
    }
  }

  // 4. PANIC CLICK LOCK
  function answer(selectedOption: string) {
    if (
      !socket ||
      !participant ||
      !state?.currentQuestion ||
      isSubmitting ||
      state.alreadyAnswered
    )
      return;

    setIsSubmitting(true); // Instantly lock the UI

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
        if (ack.ok) {
          setMessage("Answer submitted. Waiting for next question...");
          setState((current) =>
            current ? { ...current, alreadyAnswered: true } : current,
          );
        } else {
          setMessage(ack.error ?? "Answer rejected");
          setIsSubmitting(false); // Unlock only if there was an error so they can try again
        }
      },
    );
  }

  // --- JOIN SCREEN (Unregistered User) ---
  if (!participant) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
            QuizSession {roomCode}
          </p>
          <h1 className="mt-2 text-3xl font-bold">ISKCON Event Quiz</h1>

          <div className="mt-8">
            <label className="block text-sm font-semibold text-slate-800">
              Your Name
            </label>
            <input
              className="focus-ring mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-leaf"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Enter your full name"
            />
          </div>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-800">
              WhatsApp Number
            </label>
            <input
              type="tel"
              className="focus-ring mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 outline-none focus:border-leaf"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit WhatsApp number"
            />
            <p className="mt-2 text-xs font-medium text-slate-500">
              * Results, gift coupons, and photos for today's event will be
              shared on this number.
            </p>
          </div>

          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-3 text-center text-sm font-semibold text-emerald-900">
              Mandatory: Join our community to play
            </p>
            <a
              href="https://chat.whatsapp.com/YOUR_INVITE_LINK_HERE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              💬 Step 1: Join WhatsApp Group
            </a>

            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 outline-none"
                checked={hasJoinedWa}
                onChange={(e) => setHasJoinedWa(e.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-800">
                Step 2: I confirm I have joined the ISKCON WhatsApp Community.
              </span>
            </label>
          </div>

          <button
            className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-leaf px-4 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              !name.trim() || phone.length !== 10 || !hasJoinedWa || isJoining
            }
            onClick={join}
          >
            {isJoining ? <Loader2 size={18} className="animate-spin" /> : null}
            {isJoining ? "Joining..." : "Enter Quiz"}
          </button>

          {message && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-center border border-red-100">
              <p className="text-sm font-semibold text-red-600">{message}</p>
            </div>
          )}
        </section>
      </main>
    );
  }

  // --- LOADING SCREEN ---
  if (!state)
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-leaf" />
          <p className="font-semibold">Connecting to room...</p>
        </div>
      </main>
    );

  // --- ACTIVE QUESTION SCREEN ---
  if (state.room.status === "QUESTION_ACTIVE" && state.currentQuestion) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <section className="mx-auto max-w-xl">
          <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-slate-200">
            <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">
              Question {state.currentQuestion.order}/{state.quiz.questionCount}
            </span>
            <span
              className={`text-xl font-black tabular-nums ${secondsLeft <= 5 ? "text-red-600 animate-pulse" : "text-slate-900"}`}
            >
              {secondsLeft}s
            </span>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h1 className="text-2xl font-black text-slate-900 leading-tight">
              {state.currentQuestion.text}
            </h1>
          </div>

          <div className="mt-6 grid gap-3">
            {options.map(([key, label]) => {
              const isLocked =
                state.alreadyAnswered || isSubmitting || secondsLeft === 0;
              return (
                <button
                  key={key}
                  disabled={isLocked}
                  onClick={() => answer(key)}
                  className={`group relative flex items-center rounded-xl border-2 bg-white p-4 text-left font-semibold transition-all ${
                    isLocked
                      ? "border-slate-200 opacity-60 cursor-not-allowed"
                      : "border-slate-200 hover:border-leaf hover:bg-emerald-50 active:scale-[0.98]"
                  }`}
                >
                  <span
                    className={`mr-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-bold transition-colors ${
                      isLocked
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-100 text-emerald-800 group-hover:bg-leaf group-hover:text-white"
                    }`}
                  >
                    {key}
                  </span>
                  <span className="text-lg text-slate-800">{label}</span>
                </button>
              );
            })}
          </div>

          {(state.alreadyAnswered || isSubmitting) && (
            <div className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              <p className="text-sm font-bold text-amber-900">
                Answer locked! Waiting for others...
              </p>
            </div>
          )}

          {message && !state.alreadyAnswered && !isSubmitting && (
            <p className="mt-4 text-center text-sm font-semibold text-red-600">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  // --- WAITING / FINISHED SCREEN ---
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-md">
        <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
          {participant.name}
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">
          {state.quiz.title}
        </h1>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">
            QuizSession
          </p>
          <p className="text-4xl font-black text-slate-900 mb-6">{roomCode}</p>

          {state.room.status === "FINISHED" ? (
            <div className="rounded-xl bg-slate-900 p-6">
              <p className="text-lg font-bold text-white">Quiz Completed! 🎉</p>
              <p className="mt-2 text-sm text-slate-300">
                Check the main screen for the final results.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-leaf" />
              <p className="font-semibold text-slate-700">
                Waiting for the admin to start...
              </p>
            </div>
          )}

          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-leaf border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {state.room.participantCount} Players Connected
          </div>
        </div>

        {message && (
          <p className="mt-6 text-center text-sm font-semibold text-slate-500 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

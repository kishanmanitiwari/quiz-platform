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
  quiz: {
    title: string;
    questionCount: number;
  };
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

type Result = {
  rank?: number;
  totalScore?: number;
  correctAnswers?: number;
  totalQuestions?: number;
};

const QUOTES = [
  "“Always think of Me, become My devotee, worship Me and offer your homage unto Me.”",
  "“There is no truth superior to Me.”",
  "“A person who sees Me in everything and everything in Me is never lost to Me.”",
  "“One who is devoted to Me is very dear to Me.”",
  "“The highest perfection of human life is to remember Krishna at all times.”",
];

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

  const [quoteIndex, setQuoteIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  // ---------------------------------------------------------
  // RESTORE PARTICIPANT
  // ---------------------------------------------------------

  useEffect(() => {
    const saved = localStorage.getItem(participantKey(roomCode));

    if (!saved) return;

    try {
      setParticipant(JSON.parse(saved));
    } catch {
      localStorage.removeItem(participantKey(roomCode));
    }
  }, [roomCode]);

  // ---------------------------------------------------------
  // SOCKET CONNECTION
  // ---------------------------------------------------------

  useEffect(() => {
    if (!participant) return;

    const client = io(SOCKET_URL, {
      transports: ["websocket"],
    });

    const payload = {
      roomCode,
      participantId: participant.id,
      sessionId: participant.sessionId,
    };

    client.emit(
      "participant:reconnect",
      payload,
      (ack: {
        ok: boolean;
        state?: State;
        error?: string;
      }) => {
        if (ack.ok && ack.state) {
          setState({
            ...ack.state,
            alreadyAnswered: false,
          });
        }

        if (!ack.ok) {
          setMessage(ack.error ?? "Reconnect failed");
        }
      }
    );

    client.on("room:state", (newState: State) => {
      setState(newState);
    });

    // IMPORTANT:
    // Explicitly reset alreadyAnswered when a NEW question starts.
    client.on("question:start", (newState: State) => {
      setState({
        ...newState,
        alreadyAnswered: false,
      });

      setMessage("");

      // Remove browser focus from the previous answer button.
      requestAnimationFrame(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
    });

    client.on("question:end", ({ leaderboard }) => {
      // Don't show repetitive "waiting" messages.
      // The UI itself communicates that the answer is locked.
      if (leaderboard?.[0]) {
        // Intentionally no UI message here.
      }
    });

    client.on("quiz:finish", ({ leaderboard }) => {
      const myResult = leaderboard?.find(
        (x: any) => x.participantId === participant.id
      );

      setResult({
        rank: myResult?.rank,
        totalScore: myResult?.totalScore,
        correctAnswers: myResult?.correctAnswers,
        totalQuestions: undefined,
      });

      setMessage("");

      setState((current) =>
        current
          ? {
              ...current,
              room: {
                ...current.room,
                status: "FINISHED",
              },
              alreadyAnswered: false,
            }
          : current
      );

      // Fetch final result once.
      fetch(`${API_URL}/api/participants/${participant.id}/result`)
        .then(async (res) => {
          if (!res.ok) return;

          const data = await res.json();

          setResult((current) => ({
            ...current,
            ...data,
          }));
        })
        .catch(() => {
          // Leaderboard data is already available.
        });
    });

    setSocket(client);

    return () => {
      client.close();
    };
  }, [participant, roomCode]);

  // ---------------------------------------------------------
  // QUESTION TIMER
  // ---------------------------------------------------------

  useEffect(() => {
    if (
      state?.room.status !== "QUESTION_ACTIVE" ||
      !state.room.questionEndsAt
    ) {
      setSecondsLeft(0);
      return;
    }

    const updateTimer = () => {
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil(
            (new Date(state.room.questionEndsAt!).getTime() -
              Date.now()) /
              1000
          )
        )
      );
    };

    updateTimer();

    const timer = window.setInterval(updateTimer, 500);

    return () => window.clearInterval(timer);
  }, [
    state?.room.status,
    state?.room.questionEndsAt,
  ]);

  // ---------------------------------------------------------
  // WAITING SCREEN QUOTES
  // ---------------------------------------------------------

  useEffect(() => {
    if (!state) return;

    const isWaiting =
      state.room.status !== "QUESTION_ACTIVE" &&
      state.room.status !== "FINISHED";

    if (!isWaiting) return;

    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % QUOTES.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [state?.room.status]);

  // ---------------------------------------------------------
  // OPTIONS
  // ---------------------------------------------------------

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

  // ---------------------------------------------------------
  // JOIN
  // ---------------------------------------------------------

  async function join() {
    setMessage("");

    const sessionId = getSessionId();

    try {
      const res = await fetch(`${API_URL}/api/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roomCode,
          name,
          phone,
          sessionId,
        }),
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
            "You have already joined or played this quiz with this WhatsApp number!"
          );
        }

        return setMessage(
          body.error ?? "Could not join room"
        );
      }

      const saved = {
        id: body.participant.id,
        name: body.participant.name,
        sessionId,
      };

      localStorage.setItem(
        participantKey(roomCode),
        JSON.stringify(saved)
      );

      setParticipant(saved);
      setState({
        ...body.state,
        alreadyAnswered: false,
      });
    } catch {
      setMessage("Network error. Please try again.");
    }
  }

  // ---------------------------------------------------------
  // ANSWER
  // ---------------------------------------------------------

  function answer(selectedOption: string) {
    if (
      !socket ||
      !participant ||
      !state?.currentQuestion ||
      state.alreadyAnswered
    ) {
      return;
    }

    socket.emit(
      "answer:submit",
      {
        roomCode,
        participantId: participant.id,
        sessionId: participant.sessionId,
        questionId: state.currentQuestion.id,
        selectedOption,
      },
      (ack: {
        ok: boolean;
        error?: string;
      }) => {
        if (!ack.ok) {
          setMessage(
            ack.error ?? "Answer rejected"
          );
          return;
        }

        // Clear any old message.
        setMessage("");

        // Lock the current question.
        setState((current) =>
          current
            ? {
                ...current,
                alreadyAnswered: true,
              }
            : current
        );

        // IMPORTANT:
        // Prevent the clicked button from retaining browser focus
        // when the next question renders.
        requestAnimationFrame(() => {
          (document.activeElement as HTMLElement | null)?.blur();
        });
      }
    );
  }

  // ---------------------------------------------------------
  // JOIN SCREEN
  // ---------------------------------------------------------

  if (!participant) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-emerald-50/40 px-4 py-8">
        <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-leaf">
              Hare Krishna 🙏
            </p>

            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              QuizSession {roomCode}
            </p>

            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
              ISKCON Event Quiz
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Test your knowledge, have fun and remember Krishna.
            </p>
          </div>

          <div className="mt-8">
            <label className="block text-sm font-bold text-slate-800">
              Your Name
            </label>

            <input
              className="focus-ring mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none transition focus:border-leaf"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Enter your full name"
            />
          </div>

          <div className="mt-5">
            <label className="block text-sm font-bold text-slate-800">
              WhatsApp Number
            </label>

            <input
              type="tel"
              inputMode="numeric"
              className="focus-ring mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none transition focus:border-leaf"
              value={phone}
              onChange={(e) =>
                setPhone(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 10)
                )
              }
              placeholder="10-digit WhatsApp number"
            />

            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
              Results, gift coupons, and photos for today's
              event will be shared on this number.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-3 text-center text-sm font-bold text-emerald-900">
              Join the community to play
            </p>

            <a
              href="https://chat.whatsapp.com/YOUR_INVITE_LINK_HERE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white shadow-sm transition hover:opacity-90"
            >
              💬 Step 1: Join WhatsApp Group
            </a>

            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                checked={hasJoinedWa}
                onChange={(e) =>
                  setHasJoinedWa(e.target.checked)
                }
              />

              <span className="text-sm font-semibold leading-relaxed text-slate-800">
                Step 2: I confirm I have joined the ISKCON
                WhatsApp Community.
              </span>
            </label>
          </div>

          <button
            className="focus-ring mt-6 w-full rounded-xl bg-leaf px-4 py-3.5 font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              !name.trim() ||
              phone.length !== 10 ||
              !hasJoinedWa
            }
            onClick={join}
          >
            Enter Quiz →
          </button>

          {message && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-center">
              <p className="text-sm font-semibold text-red-600">
                {message}
              </p>
            </div>
          )}
        </section>
      </main>
    );
  }

  // ---------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-leaf" />

          <p className="mt-4 font-semibold text-slate-700">
            Connecting to the quiz...
          </p>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------
  // ACTIVE QUESTION
  // ---------------------------------------------------------

  if (
    state.room.status === "QUESTION_ACTIVE" &&
    state.currentQuestion
  ) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <section
          key={state.currentQuestion.id}
          className="mx-auto max-w-xl"
        >
          <div className="flex items-center justify-between text-sm font-bold text-slate-700">
            <span>
              Question {state.currentQuestion.order}/
              {state.quiz.questionCount}
            </span>

            <span
              className={`rounded-full px-3 py-1 ${
                secondsLeft <= 5
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-leaf"
              }`}
            >
              {secondsLeft}s
            </span>
          </div>

          <h1 className="mt-6 text-2xl font-black leading-tight text-slate-900">
            {state.currentQuestion.text}
          </h1>

          <div className="mt-7 grid gap-3">
            {options.map(([key, label]) => (
              <button
                key={`${state.currentQuestion!.id}-${key}`}
                type="button"
                disabled={state.alreadyAnswered}
                onClick={() => answer(key)}
                className="focus-ring rounded-2xl border border-slate-200 bg-white p-5 text-left font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-leaf hover:shadow-md focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-leaf">
                  {key}
                </span>

                {label}
              </button>
            ))}
          </div>

          {state.alreadyAnswered && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <p className="font-bold text-emerald-900">
                Answer locked ✓
              </p>

              <p className="mt-1 text-sm font-medium text-emerald-800">
                Get ready for the next question.
              </p>
            </div>
          )}

          {message && (
            <p className="mt-4 text-center text-sm font-semibold text-red-600">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  // ---------------------------------------------------------
  // FINISHED SCREEN
  // ---------------------------------------------------------

  if (state.room.status === "FINISHED") {
    const rank = result?.rank;
    const score = result?.totalScore;

    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-4 py-8">
        <section className="mx-auto max-w-md">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl shadow-sm">
              🎉
            </div>

            <p className="mt-5 text-sm font-bold uppercase tracking-widest text-leaf">
              Hare Krishna 🙏
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">
              Hari Bol!
            </h1>

            <p className="mt-2 text-slate-600">
              You completed the quiz,{" "}
              <span className="font-bold text-slate-900">
                {participant.name}
              </span>
              .
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
            <div className="bg-leaf px-6 py-6 text-center text-white">
              <p className="text-sm font-bold uppercase tracking-widest opacity-80">
                Your Score
              </p>

              <div className="mt-2 text-5xl font-black">
                {score ?? "—"}
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Rank
                </p>

                <p className="mt-1 text-3xl font-black text-slate-900">
                  {rank ? `#${rank}` : "—"}
                </p>
              </div>

              <div className="p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Participants
                </p>

                <p className="mt-1 text-3xl font-black text-slate-900">
                  {state.room.participantCount}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center">
            <p className="font-bold text-emerald-900">
              Thank you for participating! 🙏
            </p>

            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              Keep learning, keep serving and keep remembering
              Krishna.
            </p>
          </div>

          <p className="mt-6 text-center text-sm font-semibold text-slate-500">
            Final results are also available on the event screen.
          </p>
        </section>
      </main>
    );
  }

  // ---------------------------------------------------------
  // WAITING SCREEN
  // ---------------------------------------------------------

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-4 py-8">
      <section className="mx-auto max-w-md">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-leaf">
            Hare Krishna 🙏
          </p>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            QuizSession {roomCode}
          </p>

          <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900">
            You're In!
          </h1>

          <p className="mt-2 text-slate-600">
            Welcome,{" "}
            <span className="font-bold text-slate-900">
              {participant.name}
            </span>
          </p>
        </div>

        {/* Waiting card */}
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <span className="text-3xl">🙏</span>
          </div>

          <h2 className="mt-4 text-xl font-black text-slate-900">
            Waiting for the quiz to begin
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Stay on this screen. The quiz will start automatically.
          </p>

          {/* Live participant count */}
          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-slate-50 px-4 py-4">
            <span className="text-2xl">👥</span>

            <div className="text-left">
              <p className="text-2xl font-black text-slate-900">
                {state.room.participantCount}
              </p>

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                devotees joined
              </p>
            </div>

            <span className="ml-2 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
          </div>
        </div>

        {/* Rotating quote */}
        <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-amber-700">
            Krishna-Conscious Thought
          </p>

          <p
            key={quoteIndex}
            className="mt-4 min-h-[72px] text-center text-base font-semibold leading-relaxed text-amber-950"
          >
            {QUOTES[quoteIndex]}
          </p>

          <div className="mt-5 flex justify-center gap-1.5">
            {QUOTES.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === quoteIndex
                    ? "w-5 bg-amber-600"
                    : "w-1.5 bg-amber-300"
                }`}
              />
            ))}
          </div>
        </div>

        {message && (
          <p className="mt-4 text-center text-sm font-semibold text-red-600">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
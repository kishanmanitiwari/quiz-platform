"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import { Maximize2, Play, Square, Loader2, Trophy, Medal } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SOCKET_URL } from "@/lib/config";

type RoomPayload = {
  room: {
    id: string;
    roomCode: string;
    status: string;
    currentQuestion: number;
    questionEndsAt: string | null;
    quiz: {
      id: string;
      title: string;
      questions: {
        order: number;
        text: string;
        optionA: string;
        optionB: string;
        optionC: string;
        optionD: string;
        correctOption: "A" | "B" | "C" | "D";
      }[];
    };
    participants: { id: string; name: string }[];
  };
  leaderboard: {
    rank: number;
    name: string;
    totalScore: number;
    correctAnswers: number;
    totalTime: number;
  }[];
};

type PublicState = {
  room: {
    id: string;
    roomCode: string;
    status: string;
    currentQuestion: number;
    questionEndsAt: string | null;
    participantCount: number;
  };
  participants: { id: string; name: string }[];
  currentQuestion: { order: number; text: string } | null;
};

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const [data, setData] = useState<RoomPayload | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const joinUrl = useMemo(() => {
    if (!data) return "";
    return `${window.location.origin}/join/${data.room.roomCode}`;
  }, [data]);

  async function load() {
    const body = await apiFetch<RoomPayload>(`/api/admin/rooms/${roomId}`);
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(joinUrl, { width: 360, margin: 1 }).then(setQr);
  }, [data, joinUrl]);

  useEffect(() => {
    const client = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token: localStorage.getItem("admin_token") },
    });
    client.emit(
      "admin:join",
      { roomId },
      (ack: { ok: boolean; state?: PublicState; error?: string }) => {
        if (ack.ok && ack.state) setState(ack.state);
        if (!ack.ok) setMessage(ack.error ?? "Socket join failed");
      },
    );
    client.on("room:state", setState);
    client.on("question:start", setState);
    client.on("leaderboard:update", (leaderboard) =>
      setData((current) => (current ? { ...current, leaderboard } : current)),
    );
    client.on("question:end", ({ room, leaderboard }) => {
      setState((current) =>
        current
          ? {
              ...current,
              room: {
                ...current.room,
                status: room.status,
                currentQuestion: room.currentQuestion,
                questionEndsAt: room.questionEndsAt,
              },
            }
          : current,
      );
      setData((current) => (current ? { ...current, leaderboard } : current));
    });
    client.on("quiz:finish", ({ room, leaderboard }) => {
      setState((current) =>
        current
          ? {
              ...current,
              room: {
                ...current.room,
                status: room.status,
                currentQuestion: room.currentQuestion,
                questionEndsAt: room.questionEndsAt,
              },
            }
          : current,
      );
      setData((current) => (current ? { ...current, leaderboard } : current));
      void load();
    });
    setSocket(client);
    return () => {
      client.close();
    };
  }, [roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const questionEndsAt =
        state?.room.questionEndsAt ?? data?.room.questionEndsAt;
      if (!questionEndsAt) return setSecondsLeft(0);
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil((new Date(questionEndsAt).getTime() - Date.now()) / 1000),
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [data?.room.questionEndsAt, state?.room.questionEndsAt]);

  function emit(name: string) {
    socket?.emit(name, { roomId }, (ack: { ok: boolean; error?: string }) => {
      setMessage(ack.ok ? "" : (ack.error ?? "Action failed"));
      void load();
    });
  }

  async function finish() {
    if (!window.confirm("Are you sure you want to end the entire quiz session? This action cannot be undone.")) return;
    
    socket?.emit(
      "quiz:finish",
      { roomId },
      (ack: {
        ok: boolean;
        error?: string;
        leaderboard?: RoomPayload["leaderboard"];
      }) => {
        setMessage(ack.ok ? "" : (ack.error ?? "Finish failed"));
        const leaderboard = ack.leaderboard;
        if (leaderboard)
          setData((current) =>
            current ? { ...current, leaderboard } : current,
          );
        void load();
      },
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "WAITING":
        return <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold tracking-wide text-slate-800">WAITING</span>;
      case "QUESTION_ACTIVE":
        return <span className="animate-pulse rounded bg-emerald-500 px-2 py-1 text-xs font-bold tracking-wide text-white">LIVE</span>;
      case "ACTIVE":
      case "QUESTION_ENDED":
      case "WAITING_FOR_NEXT":
        return <span className="rounded bg-amber-400 px-2 py-1 text-xs font-bold tracking-wide text-amber-950">ACTIVE</span>;
      case "FINISHED":
        return <span className="rounded bg-slate-800 px-2 py-1 text-xs font-bold tracking-wide text-white">FINISHED</span>;
      default:
        return <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold tracking-wide text-slate-800">{status}</span>;
    }
  };

  if (!data) return <main className="p-6">Loading...</main>;
  
  const roomState = state?.room.status ?? data.room.status;
  const participants = state?.participants ?? data.room.participants;
  const currentQuestionNumber = state?.room.currentQuestion ?? data.room.currentQuestion;
  
  const currentQuestion = data.room.quiz.questions.find(
    (question) => question.order === currentQuestionNumber,
  );
  
  const questionEndsAt = state?.room.questionEndsAt ?? data.room.questionEndsAt;
  const timerExpired = questionEndsAt
    ? Date.now() >= new Date(questionEndsAt).getTime()
    : false;
      
  const showCorrectAnswer = Boolean(
    currentQuestion &&
    currentQuestionNumber > 0 &&
    (roomState !== "QUESTION_ACTIVE" || timerExpired),
  );

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/admin/quiz/${data.room.quiz.id}`}
          className="text-sm font-semibold text-leaf hover:underline"
        >
          Back to quiz
        </Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Room {data.room.roomCode}</h1>
              {getStatusBadge(roomState)}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {data.room.quiz.title}
            </p>
            <p className="mt-2 break-all text-sm text-slate-700">{joinUrl}</p>
          </div>
          
          {/* Controls hide entirely if the room is finished */}
          {roomState !== "FINISHED" && (
            <div className="flex flex-wrap gap-3">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-leaf px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
                onClick={() => emit("quiz:start")}
              >
                <Play size={18} /> 1. Start Room
              </button>

              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-saffron px-5 py-3 font-semibold text-ink transition-opacity hover:opacity-90 shadow-sm"
                onClick={() => emit("question:start")}
              >
                <Play size={18} /> {currentQuestionNumber > 0 ? "2. Next Question" : "2. Start First Question"}
              </button>

              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-white border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-red-600 shadow-sm"
                onClick={() => emit("question:end")}
                title="Use this if everyone finishes before the timer runs out"
              >
                <Square size={18} /> End Early
              </button>

              <button
                className="focus-ring rounded-md bg-slate-900 px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
                onClick={finish}
              >
                🏁 Finish Quiz
              </button>
            </div>
          )}
        </div>

        {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}

        {roomState === "QUESTION_ACTIVE" && (
          <div className="mt-6 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
            <Loader2 className="animate-spin text-emerald-600" size={20} />
            <p className="text-sm font-semibold text-emerald-800">
              Question is LIVE!
              {secondsLeft > 0 && <span className="ml-2 font-mono">({secondsLeft}s remaining)</span>}
            </p>
          </div>
        )}

        {/* ========================================= */}
        {/* GRAND FINALE VIEW (Only shown if FINISHED)  */}
        {/* ========================================= */}
        {roomState === "FINISHED" ? (
          <div className="mt-12 rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-8 text-center shadow-md">
            <Trophy className="mx-auto h-16 w-16 text-amber-500 mb-4" />
            <h2 className="text-4xl font-black text-slate-900">Final Leaderboard</h2>
            <p className="mt-2 text-lg text-slate-600">The quiz has officially concluded.</p>

            <div className="mt-10 mx-auto max-w-2xl grid gap-4 text-left">
              {data.leaderboard.length === 0 ? (
                <p className="text-center text-slate-500">No participants scored any points.</p>
              ) : (
                data.leaderboard.map((row, index) => {
                  let badgeClass = "bg-white border-slate-200 text-slate-700";
                  let rankIcon = <span className="font-black text-slate-400">#{row.rank}</span>;

                  if (index === 0) {
                    badgeClass = "bg-yellow-100 border-yellow-400 transform scale-105 shadow-md z-10 text-yellow-900";
                    rankIcon = <Medal className="h-7 w-7 text-yellow-600" />;
                  } else if (index === 1) {
                    badgeClass = "bg-slate-100 border-slate-300 text-slate-800";
                    rankIcon = <Medal className="h-6 w-6 text-slate-500" />;
                  } else if (index === 2) {
                    badgeClass = "bg-orange-100 border-orange-300 text-orange-900";
                    rankIcon = <Medal className="h-6 w-6 text-orange-600" />;
                  }

                  return (
                    <div
                      key={`${row.rank}-${row.name}`}
                      className={`flex items-center justify-between rounded-xl px-6 py-4 border-2 transition-all ${badgeClass}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                          {rankIcon}
                        </div>
                        <span className="text-xl font-bold">{row.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-2xl font-black tracking-tight">{row.totalScore}</span>
                        <span className="block text-xs font-semibold uppercase tracking-wider opacity-70">Points</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ========================================= */
          /* NORMAL LIVE VIEW (Hidden if FINISHED)     */
          /* ========================================= */
          <>
            <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                {qr && (
                  <img
                    src={qr}
                    alt={`QR code for ${joinUrl}`}
                    className="mx-auto h-auto w-full max-w-[320px]"
                  />
                )}
                <button
                  className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50 transition-colors"
                  onClick={() => qr && window.open(qr, "_blank")}
                >
                  <Maximize2 size={18} /> QR fullscreen
                </button>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-bold">
                    Participants ({participants.length})
                  </h2>
                  <div className="mt-4 grid gap-2">
                    {participants.map((p) => (
                      <p
                        key={p.id}
                        className="rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100"
                      >
                        {p.name}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-bold">Live Leaderboard</h2>
                  <div className="mt-4 grid gap-2">
                    {data.leaderboard.map((row) => (
                      <p
                        key={`${row.rank}-${row.name}`}
                        className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100"
                      >
                        <span>
                          <span className="font-semibold text-slate-500 mr-2">{row.rank}.</span> 
                          {row.name}
                        </span>
                        <span className="font-semibold text-leaf">{row.totalScore}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {(state?.currentQuestion || currentQuestion) && (
              <div className="mt-6 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-leaf uppercase tracking-wider">
                      Current question {state?.currentQuestion?.order ?? currentQuestion?.order}
                    </p>
                    <p className="mt-2 text-xl font-bold text-slate-900">
                      {state?.currentQuestion?.text ?? currentQuestion?.text}
                    </p>
                  </div>

                  {secondsLeft > 0 && (
                    <div
                      className={`flex shrink-0 flex-col items-center justify-center rounded-xl px-6 py-3 transition-all duration-300 ${
                        secondsLeft <= 5
                          ? "bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)] scale-105"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                        Time Left
                      </span>
                      <span className="mt-1 font-mono text-4xl font-black tabular-nums leading-none">
                        {secondsLeft}s
                      </span>
                    </div>
                  )}
                </div>

                {currentQuestion && (
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((letter) => {
                      const isCorrect = showCorrectAnswer && currentQuestion.correctOption === letter;
                      
                      return (
                        <div
                          key={letter}
                          className={`flex items-center rounded-lg border p-4 transition-colors ${
                            isCorrect
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <span 
                            className={`mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-bold shadow-sm transition-colors ${
                              isCorrect ? "bg-emerald-500 text-white" : "bg-white text-slate-500"
                            }`}
                          >
                            {letter}
                          </span>
                          <span className={`font-semibold ${isCorrect ? "text-emerald-950" : "text-slate-700"}`}>
                            {currentQuestion[`option${letter}`]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
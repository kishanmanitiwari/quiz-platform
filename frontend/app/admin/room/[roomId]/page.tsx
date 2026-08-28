"use client";

import { use, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import {
  Maximize2,
  Play,
  FastForward,
  Loader2,
  Trophy,
  Medal,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SOCKET_URL, API_URL } from "@/lib/config";

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

  const [isEmitting, setIsEmitting] = useState(false);
  const hasAutoEndedRef = useRef(false);

  const joinUrl = useMemo(() => {
    if (!data) return "";
    return `${window.location.origin}/join/${data.room.roomCode}`;
  }, [data]);

  async function load() {
    try {
      const body = await apiFetch<RoomPayload>(`/api/admin/rooms/${roomId}`);
      setData(body);
      setMessage((prev) => (prev.includes("offline") ? "" : prev));
    } catch (error) {
      console.warn("Network offline. Keeping current state in UI.");
    }
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
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    const joinRoom = () => {
      client.emit(
        "admin:join",
        { roomId },
        (ack: { ok: boolean; state?: PublicState; error?: string }) => {
          if (ack.ok && ack.state) {
            if (ack.state.room) {
              setState(ack.state);
              setMessage("");
            }
          }
          if (!ack.ok) setMessage(ack.error ?? "Socket join failed");
        },
      );
    };

    client.on("connect", () => {
      setIsEmitting(false);
      setMessage("");
      hasAutoEndedRef.current = false;
      joinRoom();
      void load();
    });

    client.on("disconnect", () => {
      setIsEmitting(false);
      setMessage("⚠️ You are currently offline. Attempting to reconnect...");
    });

    client.on("connect_error", () => {
      setIsEmitting(false);
      setMessage("⚠️ Unable to connect. Retrying automatically...");
    });

    client.io.on("reconnect_failed", () => {
      setIsEmitting(false);
      setMessage(
        "⚠️ Network connection lost. Waiting for internet to return...",
      );
    });

    const handleOnline = () => {
      if (client.disconnected) {
        setMessage("🌐 Network restored! Reconnecting...");
        client.connect();
        void load();
      }
    };

    window.addEventListener("online", handleOnline);

    client.on("room:state", (incomingState: PublicState) => {
      if (!incomingState?.room) return;
      setState(incomingState);
    });

    client.on("question:start", (incomingState: PublicState) => {
      if (!incomingState?.room) return;
      setState(incomingState);
    });

    client.on("leaderboard:update", (leaderboard) =>
      setData((current) => (current ? { ...current, leaderboard } : current)),
    );

    client.on("question:end", ({ room, leaderboard }) => {
      setState((current) =>
        current ? { ...current, room: { ...current.room, ...room } } : current,
      );
      setData((current) => (current ? { ...current, leaderboard } : current));
    });

    client.on("quiz:finish", ({ room, leaderboard }) => {
      setState((current) =>
        current ? { ...current, room: { ...current.room, ...room } } : current,
      );
      setData((current) => (current ? { ...current, leaderboard } : current));
      void load();
    });

    setSocket(client);

    return () => {
      window.removeEventListener("online", handleOnline);
      client.close();
    };
  }, [roomId]);

  function emit(name: string) {
    if (isEmitting) return;

    if (!socket || !socket.connected) {
      setMessage("⚠️ Cannot perform action while offline. Wait for reconnect.");
      setIsEmitting(false);
      hasAutoEndedRef.current = false;
      return;
    }

    setIsEmitting(true);

    socket
      .timeout(5000)
      .emit(
        name,
        { roomId },
        (err: Error | null, ack: { ok: boolean; error?: string }) => {
          setIsEmitting(false);

          if (err) {
            setMessage(
              "⚠️ Network timeout. Please check your connection and try again.",
            );
            hasAutoEndedRef.current = false;
            void load();
            return;
          }

          if (!ack.ok) {
            setMessage(ack.error ?? "Action failed");
            hasAutoEndedRef.current = false; 
          } else {
            setMessage("");
          }
          void load();
        },
      );
  }

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

  const roomState = state?.room.status ?? data?.room.status ?? "WAITING";
  const questionEndsAt =
    state?.room.questionEndsAt ?? data?.room.questionEndsAt;

  useEffect(() => {
    if (roomState === "QUESTION_ACTIVE" && secondsLeft > 0) {
      hasAutoEndedRef.current = false;
    }

    if (
      roomState === "QUESTION_ACTIVE" &&
      secondsLeft === 0 &&
      questionEndsAt &&
      !hasAutoEndedRef.current
    ) {
      const hasExpired = Date.now() >= new Date(questionEndsAt).getTime();
      if (hasExpired && !isEmitting) {
        hasAutoEndedRef.current = true;
        emit("question:end");
      }
    }
  }, [secondsLeft, roomState, questionEndsAt, isEmitting]);

  async function finish() {
    if (
      !window.confirm(
        "Are you sure you want to end the entire quiz session? This action cannot be undone.",
      )
    )
      return;

    if (isEmitting) return;

    if (!socket || !socket.connected) {
      setMessage("⚠️ Cannot perform action while offline. Wait for reconnect.");
      return;
    }

    setIsEmitting(true);

    socket.timeout(5000).emit(
      "quiz:finish",
      { roomId },
      (
        err: Error | null,
        ack: {
          ok: boolean;
          error?: string;
          leaderboard?: RoomPayload["leaderboard"];
        },
      ) => {
        setIsEmitting(false);

        if (err) {
          setMessage(
            "⚠️ Network timeout. Please check your connection and try again.",
          );
          void load();
          return;
        }

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
        return (
          <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold tracking-wide text-slate-800">
            WAITING FOR PLAYERS
          </span>
        );
      case "QUESTION_ACTIVE":
        return (
          <span className="animate-pulse rounded bg-emerald-500 px-2 py-1 text-xs font-bold tracking-wide text-white">
            LIVE
          </span>
        );
      case "ACTIVE":
      case "QUESTION_ENDED":
      case "WAITING_FOR_NEXT":
        return (
          <span className="rounded bg-amber-400 px-2 py-1 text-xs font-bold tracking-wide text-amber-950">
            ACTIVE
          </span>
        );
      case "FINISHED":
        return (
          <span className="rounded bg-slate-800 px-2 py-1 text-xs font-bold tracking-wide text-white">
            FINISHED
          </span>
        );
      default:
        return (
          <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold tracking-wide text-slate-800">
            {status}
          </span>
        );
    }
  };

  if (!data) return <main className="p-6">Loading...</main>;

  const participants = state?.participants ?? data.room.participants;
  const currentQuestionNumber =
    state?.room.currentQuestion ?? data.room.currentQuestion;

  const currentQuestion = data.room.quiz.questions.find(
    (question) => question.order === currentQuestionNumber,
  );

  const timerExpired = questionEndsAt
    ? Date.now() >= new Date(questionEndsAt).getTime()
    : false;

  const showCorrectAnswer = Boolean(
    currentQuestion &&
    currentQuestionNumber > 0 &&
    (roomState !== "QUESTION_ACTIVE" || timerExpired),
  );

  const winner = data.leaderboard[0];
  const runnersUp = data.leaderboard.slice(1);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-7xl">
        <Link
          href={`/admin/quiz/${data.room.quiz.id}`}
          className="text-sm font-semibold text-leaf hover:underline"
        >
          &larr; Back to quiz
        </Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                QuizSession {data.room.roomCode}
              </h1>
              {getStatusBadge(roomState)}
            </div>
            <p className="mt-1 text-sm text-slate-600 font-medium">
              {data.room.quiz.title}
            </p>
            {roomState === "WAITING" && (
              <p className="mt-2 break-all text-sm text-slate-500 bg-slate-200 inline-block px-3 py-1 rounded-md">
                {joinUrl}
              </p>
            )}
          </div>

          {roomState !== "FINISHED" && (
            <div className="flex flex-wrap gap-3">
              {roomState === "WAITING" && (
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-md bg-leaf px-5 py-3 font-bold text-white transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => emit("quiz:start")}
                  disabled={isEmitting}
                >
                  {isEmitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Play size={18} />
                  )}{" "}
                  Start Quiz Session
                </button>
              )}

              {roomState !== "WAITING" && (
                <>
                  {roomState === "QUESTION_ACTIVE" ? (
                    <button
                      className={`focus-ring inline-flex items-center gap-2 rounded-md px-5 py-3 font-bold transition-colors shadow-sm disabled:cursor-not-allowed ${
                        secondsLeft > 0
                          ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          : "bg-slate-200 text-slate-500"
                      }`}
                      onClick={() => emit("question:end")}
                      disabled={secondsLeft === 0 || isEmitting}
                      title="Reveal answers and leaderboard"
                    >
                      {secondsLeft === 0 || isEmitting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />{" "}
                          Fetching Results...
                        </>
                      ) : (
                        <>
                          <FastForward size={18} /> Skip Remaining Time
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      className="focus-ring inline-flex items-center gap-2 rounded-md bg-saffron px-5 py-3 font-bold text-ink transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => emit("question:start")}
                      disabled={isEmitting}
                    >
                      {isEmitting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Play size={18} />
                      )}
                      {currentQuestionNumber > 0
                        ? "Start Next Question"
                        : "Start First Question"}
                    </button>
                  )}
                </>
              )}

              <button
                className="focus-ring rounded-md bg-slate-900 px-5 py-3 font-bold text-white transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={finish}
                disabled={isEmitting}
              >
                🏁 Finish Quiz
              </button>
            </div>
          )}
        </div>

        {message && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">{message}</p>
          </div>
        )}

        {roomState === "FINISHED" ? (
          <div className="mt-12 text-center">
            {winner ? (
              <div className="relative mx-auto mb-12 max-w-4xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500 p-16 shadow-[0_10px_50px_rgba(251,191,36,0.4)] border-4 border-yellow-200">
                <div className="absolute left-8 top-8 animate-bounce text-7xl opacity-90 drop-shadow-md">
                  🎈
                </div>
                <div className="absolute right-12 top-16 animate-pulse text-7xl opacity-90 drop-shadow-md">
                  🎉
                </div>
                <div
                  className="absolute bottom-12 left-16 animate-bounce text-6xl opacity-90 drop-shadow-md"
                  style={{ animationDelay: "0.2s" }}
                >
                  🎊
                </div>
                <div
                  className="absolute bottom-8 right-16 animate-bounce text-7xl opacity-90 drop-shadow-md"
                  style={{ animationDelay: "0.5s" }}
                >
                  🎈
                </div>

                <Trophy className="mx-auto mb-6 h-32 w-32 text-white drop-shadow-xl" />
                <h2 className="text-2xl font-black uppercase tracking-widest text-yellow-900/60">
                  Grand Winner
                </h2>
                <h3 className="mt-2 text-7xl font-black text-white drop-shadow-lg">
                  {winner.name}
                </h3>
                <p className="mt-8 inline-block rounded-full bg-white/25 px-10 py-4 text-4xl font-black tracking-tight text-white backdrop-blur-sm shadow-inner">
                  {winner.totalScore}{" "}
                  <span className="text-2xl font-bold uppercase tracking-wider opacity-80">
                    Points
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-center text-slate-500">
                No participants scored any points.
              </p>
            )}

            {runnersUp.length > 0 && (
              <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="mb-6 text-left text-2xl font-bold text-slate-800">
                  Runner Ups
                </h3>
                <div className="grid gap-4 text-left">
                  {runnersUp.map((row, index) => {
                    let badgeClass = "bg-white border-slate-200 text-slate-700";
                    let rankIcon = (
                      <span className="font-black text-slate-400">
                        #{row.rank}
                      </span>
                    );

                    if (index === 0) {
                      badgeClass =
                        "bg-slate-100 border-slate-300 text-slate-800";
                      rankIcon = <Medal className="h-6 w-6 text-slate-500" />;
                    } else if (index === 1) {
                      badgeClass =
                        "bg-orange-100 border-orange-300 text-orange-900";
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
                          <span className="block text-2xl font-black tracking-tight">
                            {row.totalScore}
                          </span>
                          <span className="block text-xs font-semibold uppercase tracking-wider opacity-70">
                            Points
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {roomState === "WAITING" ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-center font-bold text-slate-800 text-lg mb-4">
                    Join the Game!
                  </h2>
                  {qr && (
                    <img
                      src={qr}
                      alt={`QR code for ${joinUrl}`}
                      className="mx-auto h-auto w-full max-w-[320px] rounded-lg border-4 border-slate-100"
                    />
                  )}
                  <button
                    className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50 transition-colors"
                    onClick={() => qr && window.open(qr, "_blank")}
                  >
                    <Maximize2 size={18} /> Fullscreen QR
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold mb-6 border-b pb-4">
                    Participants ({participants.length})
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {participants.map((p) => (
                      <p
                        key={p.id}
                        className="rounded-full bg-slate-100 px-4 py-2 font-semibold text-slate-700 border border-slate-200"
                      >
                        {p.name}
                      </p>
                    ))}
                    {participants.length === 0 && (
                      <p className="text-slate-500 italic mt-4 w-full text-center">
                        Waiting for players to scan and join...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
                <div className="flex flex-col gap-6">
                  {roomState === "QUESTION_ACTIVE" && (
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
                      <Loader2
                        className="animate-spin text-emerald-600"
                        size={24}
                      />
                      <p className="text-lg font-bold text-emerald-800 tracking-wide">
                        Question is LIVE! Answers are locking in...
                      </p>
                    </div>
                  )}

                  {state?.currentQuestion || currentQuestion ? (
                    <div className="rounded-xl border-2 border-slate-200 bg-white p-8 shadow-md">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
                        <div>
                          <p className="text-sm font-bold text-leaf uppercase tracking-widest bg-emerald-50 inline-block px-3 py-1 rounded-full">
                            Question{" "}
                            {state?.currentQuestion?.order ??
                              currentQuestion?.order}{" "}
                            of {data.room.quiz.questions.length}
                          </p>
                          <p className="mt-4 text-3xl font-black text-slate-900 leading-tight">
                            {state?.currentQuestion?.text ??
                              currentQuestion?.text}
                          </p>
                        </div>

                        {secondsLeft > 0 && (
                          <div
                            className={`flex shrink-0 flex-col items-center justify-center rounded-2xl px-6 py-4 transition-all duration-300 ${
                              secondsLeft <= 5
                                ? "bg-red-600 text-white animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)] scale-105"
                                : "bg-slate-900 text-white"
                            }`}
                          >
                            <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                              Time Left
                            </span>
                            <span className="mt-1 font-mono text-5xl font-black tabular-nums leading-none">
                              {secondsLeft}
                            </span>
                          </div>
                        )}
                      </div>

                      {currentQuestion && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4">
                          {(["A", "B", "C", "D"] as const).map((letter) => {
                            const isCorrect =
                              showCorrectAnswer &&
                              currentQuestion.correctOption === letter;

                            return (
                              <div
                                key={letter}
                                className={`flex items-center rounded-xl border-2 p-5 transition-colors ${
                                  isCorrect
                                    ? "border-emerald-500 bg-emerald-100 shadow-sm"
                                    : "border-slate-200 bg-slate-50"
                                }`}
                              >
                                <span
                                  className={`mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-black text-lg shadow-sm transition-colors ${
                                    isCorrect
                                      ? "bg-emerald-600 text-white"
                                      : "bg-white text-slate-500 border border-slate-200"
                                  }`}
                                >
                                  {letter}
                                </span>
                                <span
                                  className={`text-lg font-bold ${isCorrect ? "text-emerald-950" : "text-slate-700"}`}
                                >
                                  {currentQuestion[`option${letter}`]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                      <p className="text-xl font-semibold text-slate-500">
                        Waiting for next question...
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[800px]">
                    <div className="bg-slate-900 px-6 py-4">
                      <h2 className="text-lg font-bold text-white flex justify-between items-center">
                        Live Leaderboard{" "}
                        <Trophy size={18} className="text-yellow-400" />
                      </h2>
                    </div>

                    <div className="p-4 overflow-y-auto custom-scrollbar">
                      <div className="grid gap-2">
                        {data.leaderboard.length === 0 ? (
                          <p className="text-center text-slate-500 py-4 italic">
                            No scores yet
                          </p>
                        ) : (
                          data.leaderboard.map((row) => (
                            <div
                              key={`${row.rank}-${row.name}`}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 border border-slate-100 hover:border-slate-300 transition-colors"
                            >
                              <div className="flex items-center gap-3 truncate pr-4">
                                <span
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                                    row.rank === 1
                                      ? "bg-yellow-400 text-yellow-900"
                                      : row.rank === 2
                                        ? "bg-slate-300 text-slate-800"
                                        : row.rank === 3
                                          ? "bg-orange-300 text-orange-900"
                                          : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {row.rank}
                                </span>
                                <span className="font-bold text-slate-800 truncate">
                                  {row.name}
                                </span>
                              </div>
                              <span className="font-black text-leaf tabular-nums bg-emerald-100 px-2 py-1 rounded">
                                {row.totalScore}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

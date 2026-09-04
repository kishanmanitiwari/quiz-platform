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

type Tab = "quiz" | "gitasar" | "team";

const TEAM_IMAGES = [
  "/Team 09.21.01 (1).jpeg",
  "/Team 09.21.01.jpeg",
  "/Team 15.32.50.jpeg",
  "/Team 15.34.29 (2).jpeg",
  "/Team 15.34.29 (3).jpeg",
  "/Team 15.45.15 (2).jpeg",
  "/Team 15.45.18.jpeg",
  "/Team 15.57.08 (1).jpeg",
  "/Team 15.57.08 (3).jpeg",
  "/Team 15.57.09 (1).jpeg",
  "/Team 15.58.18.jpeg",
];

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

  // Dashboard Tab State (Manual Mode)
  const [activeTab, setActiveTab] = useState<Tab>("quiz");
  const [teamImageIndex, setTeamImageIndex] = useState(0);

  const dashboardTabs: { id: Tab; label: string; icon: string }[] = [
    { id: "quiz", label: "Free Quiz", icon: "🔥" },
    { id: "gitasar", label: "Gitasar Course", icon: "📖" },
    { id: "team", label: "The Team", icon: "👥" },
  ];

  useEffect(() => {
    if (activeTab !== "team") return;

    const interval = window.setInterval(() => {
      setTeamImageIndex(
        (currentIndex) => (currentIndex + 1) % TEAM_IMAGES.length,
      );
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

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
    QRCode.toDataURL(joinUrl, { width: 1000, margin: 1 }).then(setQr);
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

  if (!data)
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 p-6">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <span className="font-medium text-slate-500">Loading...</span>
      </main>
    );

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
      {/* Container scales up to full width purely for the Waiting screen */}
      <section
        className={`mx-auto ${roomState === "WAITING" ? "w-full max-w-[1920px]" : "max-w-7xl"}`}
      >
        {/* TOP ADMIN HEADER */}
        <Link
          href={`/admin/quiz/${data.room.quiz.id}`}
          className="text-sm font-semibold text-leaf hover:underline"
        >
          &larr; Back to quiz
        </Link>
        <div className="mt-3 mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">
                QuizSession {data.room.roomCode}
              </h1>
              {getStatusBadge(roomState)}
            </div>
            <p className="mt-1 text-sm text-slate-600 font-medium">
              {data.room.quiz.title}
            </p>
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
                          : "bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50"
                      }`}
                      onClick={() => emit("question:end")}
                      disabled={isEmitting}
                      title="Reveal answers and leaderboard"
                    >
                      {isEmitting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />{" "}
                          Fetching Results...
                        </>
                      ) : (
                        <>
                          <FastForward size={18} />{" "}
                          {secondsLeft > 0
                            ? "Skip Remaining Time"
                            : "End Question"}
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
          <div className="mt-4 mb-6 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">{message}</p>
          </div>
        )}

        {/* STATE RENDERERS */}
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
              /* =========================================
                 OPTIMIZED WIDESCREEN DASHBOARD (4-6-2 Grid)
                 ========================================= */
              <div className="flex flex-col rounded-[2rem] bg-white border border-slate-200 p-6 font-sans shadow-xl min-h-[750px] max-h-[85vh]">
                {/* Navigation Bar */}
                <header className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-4 pl-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
                      🙏
                    </div>
                    <div>
                      <h1 className="text-xl font-black tracking-tight text-slate-900">
                        ISKCON QUIZ STALL
                      </h1>
                      <p className="text-xs font-semibold tracking-widest text-amber-600">
                        PLAY • LEARN • GROW
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 shadow-sm">
                      🍽️ Fast Prasadam for Winners
                    </div>
                  </div>

                  <nav className="flex gap-2 pr-2">
                    {dashboardTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 rounded-xl px-6 py-3 font-bold transition-all duration-300 ${
                          activeTab === tab.id
                            ? "bg-amber-500 text-white shadow-md"
                            : "bg-transparent text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                        }`}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </header>

                {/* 12-Column Grid */}
                <div className="grid flex-1 grid-cols-12 gap-6 min-h-0">
                  {/* Left Column: Huge QR Code (Spans 4 cols) */}
                  <aside className="col-span-4 flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <h2 className="mb-4 text-3xl font-black uppercase tracking-widest text-amber-600 animate-pulse">
                      Scan to Join
                    </h2>
                    <div className="flex aspect-square w-full max-w-[480px] items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-100 bg-white p-2">
                      {qr ? (
                        <img
                          src={qr}
                          alt="QR Code"
                          className="h-full w-full object-contain mix-blend-multiply"
                        />
                      ) : (
                        <div className="h-full w-full animate-pulse bg-slate-100 rounded-lg"></div>
                      )}
                    </div>
                  </aside>

                  {/* Middle Column: Active Tab Image (Spans 6 cols) */}
                  <main className="col-span-6 rounded-2xl border border-slate-200 bg-slate-100/50 p-6 flex items-center justify-center overflow-hidden relative h-full">
                    {activeTab === "quiz" && (
                      <div
                        key="quiz"
                        className="animate-in fade-in zoom-in-95 flex h-full w-full items-center justify-center duration-500"
                      >
                        <div className="h-full w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-xl">
                          <img
                            src="/free-quiz.jpg"
                            alt="Free Quiz"
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === "gitasar" && (
                      <div
                        key="gitasar"
                        className="animate-in fade-in zoom-in-95 flex h-full w-full items-center justify-center duration-500"
                      >
                        <div className="flex h-full max-h-full max-w-full items-center justify-center rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
                          <img
                            src="/gitasar.jpg"
                            alt="Gitasar Course pamphlet"
                            className="h-full max-h-full w-auto max-w-full rounded-2xl object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === "team" && (
                      <div
                        key="team"
                        className="animate-in fade-in zoom-in-95 duration-500 w-full h-full flex flex-col items-center justify-center text-center"
                      >
                        <h2 className="mb-4 text-4xl font-black text-amber-600 drop-shadow-sm">
                          Meet the Team
                        </h2>
                        <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-3 shadow-xl">
                          <img
                            key={TEAM_IMAGES[teamImageIndex]}
                            src={TEAM_IMAGES[teamImageIndex]}
                            alt="ISKCON team"
                            className="h-[500px] w-full animate-in rounded-2xl object-cover fade-in duration-500"
                          />
                        </div>
                      </div>
                    )}
                  </main>

                  {/* Right Column: Narrower Participant List (Spans 2 cols) */}
                  <aside className="col-span-2 flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4 h-full">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xs font-black tracking-widest text-amber-600">
                        JOINED
                      </h2>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                        {participants.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                      {participants.length === 0 ? (
                        <p className="text-center text-xs font-medium italic text-slate-500 mt-6">
                          Waiting for players...
                        </p>
                      ) : (
                        participants.map((p, i) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-md bg-white border border-slate-200 px-2 py-1.5 shadow-sm"
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-[10px] font-bold text-slate-400 w-4">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="font-semibold text-slate-700 text-xs truncate">
                                {p.name}
                              </span>
                            </div>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-sm ml-1"></span>
                          </div>
                        ))
                      )}
                    </div>
                  </aside>
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

                        {secondsLeft > 0 &&
                          !isEmitting &&
                          roomState === "QUESTION_ACTIVE" && (
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

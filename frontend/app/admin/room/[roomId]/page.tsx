"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { io, type Socket } from "socket.io-client";
import { Maximize2, Play, Square, Loader2 } from "lucide-react";
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
  leaderboard: { rank: number; name: string; totalScore: number; correctAnswers: number; totalTime: number }[];
};

type PublicState = {
  room: { id: string; roomCode: string; status: string; currentQuestion: number; questionEndsAt: string | null; participantCount: number };
  participants: { id: string; name: string }[];
  currentQuestion: { order: number; text: string } | null;
};

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
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
      auth: { token: localStorage.getItem("admin_token") }
    });
    client.emit("admin:join", { roomId }, (ack: { ok: boolean; state?: PublicState; error?: string }) => {
      if (ack.ok && ack.state) setState(ack.state);
      if (!ack.ok) setMessage(ack.error ?? "Socket join failed");
    });
    client.on("room:state", setState);
    client.on("question:start", setState);
    client.on("leaderboard:update", (leaderboard) => setData((current) => current ? { ...current, leaderboard } : current));
    client.on("question:end", ({ room, leaderboard }) => {
      setState((current) => current ? { ...current, room: { ...current.room, status: room.status, currentQuestion: room.currentQuestion, questionEndsAt: room.questionEndsAt } } : current);
      setData((current) => current ? { ...current, leaderboard } : current);
    });
    client.on("quiz:finish", ({ room, leaderboard }) => {
      setState((current) => current ? { ...current, room: { ...current.room, status: room.status, currentQuestion: room.currentQuestion, questionEndsAt: room.questionEndsAt } } : current);
      setData((current) => current ? { ...current, leaderboard } : current);
      void load();
    });
    setSocket(client);
    return () => {
      client.close();
    };
  }, [roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const questionEndsAt = state?.room.questionEndsAt ?? data?.room.questionEndsAt;
      if (!questionEndsAt) return setSecondsLeft(0);
      setSecondsLeft(Math.max(0, Math.ceil((new Date(questionEndsAt).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [data?.room.questionEndsAt, state?.room.questionEndsAt]);

  function emit(name: string) {
    socket?.emit(name, { roomId }, (ack: { ok: boolean; error?: string }) => {
      // Clear out older messages so we don't hold onto stale errors
      setMessage(ack.ok ? "" : ack.error ?? "Action failed");
      void load();
    });
  }

  async function finish() {
    socket?.emit("quiz:finish", { roomId }, (ack: { ok: boolean; error?: string; leaderboard?: RoomPayload["leaderboard"] }) => {
      setMessage(ack.ok ? "" : ack.error ?? "Finish failed");
      const leaderboard = ack.leaderboard;
      if (leaderboard) setData((current) => current ? { ...current, leaderboard } : current);
      void load();
    });
  }

  // Visual Polish: Render color-coded tags based on room status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "WAITING":
        return <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold tracking-wide text-slate-800">WAITING</span>;
      case "QUESTION_ACTIVE":
        return <span className="animate-pulse rounded bg-emerald-500 px-2 py-1 text-xs font-bold tracking-wide text-white">LIVE</span>;
      case "QUESTION_ENDED":
      case "WAITING_FOR_NEXT":
        return <span className="rounded bg-amber-400 px-2 py-1 text-xs font-bold tracking-wide text-amber-950">PAUSED</span>;
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
  const currentQuestion = data.room.quiz.questions.find((question) => question.order === currentQuestionNumber);
  const questionEndsAt = state?.room.questionEndsAt ?? data.room.questionEndsAt;
  const timerExpired = questionEndsAt ? Date.now() >= new Date(questionEndsAt).getTime() : false;
  
  const correctAnswer =
    currentQuestion && currentQuestion.correctOption
      ? `${currentQuestion.correctOption}. ${currentQuestion[`option${currentQuestion.correctOption}`]}`
      : null;
  const showCorrectAnswer = Boolean(currentQuestion && currentQuestionNumber > 0 && (roomState !== "QUESTION_ACTIVE" || timerExpired));

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <Link href={`/admin/quiz/${data.room.quiz.id}`} className="text-sm font-semibold text-leaf">Back to quiz</Link>
        
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Room {data.room.roomCode}</h1>
              {getStatusBadge(roomState)}
            </div>
            <p className="mt-1 text-sm text-slate-600">{data.room.quiz.title}</p>
            <p className="mt-2 break-all text-sm text-slate-700">{joinUrl}</p>
          </div>
          
          {/* Dynamic Buttons Implementation */}
          <div className="flex flex-wrap gap-2">
            {roomState === "WAITING" && (
              <button 
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90" 
                onClick={() => emit("quiz:start")}
              >
                <Play size={18} /> Start quiz
              </button>
            )}

            {(roomState === "QUESTION_ENDED" || roomState === "WAITING_FOR_NEXT") && (
              <button 
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-saffron px-4 py-3 font-semibold text-ink transition-opacity hover:opacity-90" 
                onClick={() => emit("question:start")}
              >
                <Play size={18} /> {currentQuestionNumber > 0 ? "Next question" : "Start question"}
              </button>
            )}

            {roomState === "QUESTION_ACTIVE" && (
              <button 
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90" 
                onClick={() => emit("question:end")}
              >
                <Square size={18} /> End question
              </button>
            )}

            {roomState !== "FINISHED" && roomState !== "WAITING" && (
              <button 
                className="focus-ring rounded-md bg-ink px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90" 
                onClick={finish}
              >
                🏁 Finish Quiz
              </button>
            )}
          </div>
        </div>
        
        {/* Only show message if it explicitly exists (like a socket connection failure) */}
        {message && <p className="mt-4 text-sm font-semibold text-red-600">{message}</p>}

        {/* Visual Polish: Active Loader & Countdown Banner */}
        {roomState === "QUESTION_ACTIVE" && (
          <div className="mt-6 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Loader2 className="animate-spin text-emerald-600" size={20} />
            <p className="text-sm font-semibold text-emerald-800">
              Question is LIVE!
              {secondsLeft > 0 && <span className="ml-2 font-mono">({secondsLeft}s remaining)</span>}
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            {qr && <img src={qr} alt={`QR code for ${joinUrl}`} className="mx-auto h-auto w-full max-w-[320px]" />}
            <button className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 font-semibold text-ink ring-1 ring-slate-300 transition-colors hover:bg-slate-50" onClick={() => qr && window.open(qr, "_blank")}>
              <Maximize2 size={18} /> QR fullscreen
            </button>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-bold">Participants ({participants.length})</h2>
              <div className="mt-4 grid gap-2">
                {participants.map((p) => <p key={p.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">{p.name}</p>)}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-bold">Leaderboard</h2>
              <div className="mt-4 grid gap-2">
                {data.leaderboard.map((row) => (
                  <p key={`${row.rank}-${row.name}`} className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span>{row.rank}. {row.name}</span>
                    <span className="font-semibold">{row.totalScore}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {state?.currentQuestion && (
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-leaf">Current question {state.currentQuestion.order}</p>
            <p className="mt-2 text-lg font-bold">{state.currentQuestion.text}</p>
          </div>
        )}
        
        {showCorrectAnswer && correctAnswer && (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Correct answer</p>
            <p className="mt-2 text-lg font-bold text-emerald-950">{correctAnswer}</p>
          </div>
        )}
      </section>
    </main>
  );
}
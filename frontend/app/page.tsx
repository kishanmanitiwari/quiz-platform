import Link from "next/link";
import { ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f2] px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2 text-leaf font-bold text-xs uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1 rounded-full">
          <Sparkles size={14} /> ISKCON Live Event
        </div>
        
        <h1 className="mt-4 text-4xl font-black text-slate-900 tracking-tight">
          Live Quiz Platform
        </h1>
        
        <p className="mt-3 text-slate-600 leading-relaxed text-sm">
          Seamless room-based interactive quiz sessions equipped with real-time server-side timers, automated scoring, and live leaderboards.
        </p>

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Authorized Access</p>
            <p className="text-sm font-semibold text-slate-700">Host Dashboard</p>
          </div>

          <Link 
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-leaf px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]" 
            href="/admin/login"
          >
            <ShieldCheck size={18} /> Admin Login <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
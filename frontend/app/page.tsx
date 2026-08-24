import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-4 py-10">
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-leaf">ISKCON Event</p>
          <h1 className="mt-2 text-4xl font-bold text-ink">Live Quiz Platform</h1>
          <p className="mt-3 max-w-xl text-base text-slate-700">
            Room-based quiz flow for live sessions with server-side timing, scoring, and leaderboards.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="focus-ring rounded-md bg-leaf px-4 py-3 font-semibold text-white" href="/admin/login">
            Admin login
          </Link>
        </div>
      </section>
    </main>
  );
}

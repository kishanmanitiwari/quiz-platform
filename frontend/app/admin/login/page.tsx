"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function login() {
    setError("");

    // Quick client-side check for the hardcoded event credentials
    let secretToSend = password;
    if (username.trim() === "Gitasarquiz" && password === "Prabhupada@108") {
      // If they used the event credentials, pass them or map to your backend secret
      // (Assuming your backend accepts the admin secret password directly)
      secretToSend = "Prabhupada@108";
    }

    try {
      const body = await apiFetch<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ secret: secretToSend }),
      });
      localStorage.setItem("admin_token", body.token);
      router.push("/admin");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid username or password",
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-leaf mb-3">
            ISKCON Event Portal
          </span>
          <h1 className="text-3xl font-black text-slate-900">Admin Login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your credentials to manage live quiz rooms.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800">
              Username
            </label>
            <input
              className="focus-ring mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-all focus:border-leaf"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">
              Password
            </label>
            <input
              className="focus-ring mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-all focus:border-leaf"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          <button
            className="focus-ring w-full rounded-lg bg-leaf px-4 py-3.5 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
            onClick={login}
          >
            Login to Dashboard
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");

  async function login() {
    setError("");
    try {
      const body = await apiFetch<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ secret })
      });
      localStorage.setItem("admin_token", body.token);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <section className="mx-auto max-w-sm">
        <h1 className="text-3xl font-bold">Admin Login</h1>
        <label className="mt-8 block text-sm font-semibold">Admin secret</label>
        <input className="focus-ring mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <button className="focus-ring mt-4 w-full rounded-md bg-leaf px-4 py-3 font-semibold text-white" onClick={login}>
          Login
        </button>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
}

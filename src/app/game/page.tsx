"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const join = async () => {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed || loading) return;
    setLoading(true);
    const res = await fetch(`/api/game/${trimmed}`);
    if (res.ok) {
      router.push(`/game/${trimmed}`);
    } else {
      setError(true);
      setLoading(false);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-6 p-8">
      <p className="text-gray-600 text-xs tracking-widest uppercase">Spiel beitreten</p>
      <input
        value={code}
        onChange={e => { setCode(e.target.value); setError(false); }}
        onKeyDown={e => e.key === "Enter" && join()}
        placeholder="Code eingeben…"
        maxLength={6}
        autoFocus
        className={`bg-transparent border-b ${error ? "border-red-700 placeholder-red-900" : "border-gray-800 focus:border-gray-500"} px-2 py-2 text-white placeholder-gray-700 focus:outline-none transition-colors text-lg w-40 text-center`}
      />
      <button
        onClick={join}
        disabled={!code.trim() || loading}
        className="text-sm text-gray-600 hover:text-gray-400 disabled:opacity-20 transition"
      >
        {loading ? "…" : "Beitreten"}
      </button>
    </main>
  );
}

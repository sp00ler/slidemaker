"use client";

import { FormEvent, useState } from "react";

export function LoginForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="card auth-card">
        <a className="auth-brand" href="/">SlideMaker</a>
        <h1>Вход в кабинет</h1>
        {expired && (
          <div className="alert alert-error">
            <span className="alert-icon">!</span>
            <span>Ссылка устарела или уже использована. Запросите новую.</span>
          </div>
        )}
        {sent ? (
          <div className="auth-message">
            <strong>Проверьте почту</strong>
            <span>Если email есть в системе, мы отправили одноразовую ссылку для входа.</span>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Отправляем..." : "Получить ссылку"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";

import { saveAdminSession } from "../lib/session";

interface LoginResponse {
  admin: {
    email: string;
    id: string;
    role: "admin";
    status: string;
  };
  tokens: {
    accessToken: string;
  };
}

interface LoginErrorResponse {
  error?: {
    message?: string;
  };
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000";

export function LoginForm() {
  const [email, setEmail] = useState("admin@freeline.dev");
  const [password, setPassword] = useState("ChangeMeAdmin123!");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const body = (await response.json()) as LoginResponse | LoginErrorResponse;

      if (!response.ok) {
        const errorBody = body as LoginErrorResponse;
        throw new Error(errorBody.error?.message ?? "Unable to sign in.");
      }

      const payload = body as LoginResponse;
      saveAdminSession({
        email: payload.admin.email,
        id: payload.admin.id,
        role: payload.admin.role,
        status: payload.admin.status,
        token: payload.tokens.accessToken
      });
      window.location.href = "/users";
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Admin email</label>
        <input
          id="email"
          autoComplete="username"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="button-row">
        <button className="button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}

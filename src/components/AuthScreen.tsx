"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Mail, Music2, UserRound } from "lucide-react";

import type { AppUser, AuthMode } from "@/types";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme: string;
              size: string;
              shape: string;
              text: string;
              width: number;
            }
          ) => void;
        };
      };
    };
  }
}

type AuthScreenProps = {
  onAuthenticated: (user: AppUser) => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) {
      return;
    }

    const handleGoogleCredential = async (response: { credential: string }) => {
      setLoading(true);
      setError("");

      try {
        const result = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential })
        });
        const data = await result.json();

        if (!result.ok) {
          throw new Error(data.error || "Google sign-in failed.");
        }

        onAuthenticated(data.user);
      } catch (nextError) {
        setError((nextError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320
      });
      setGoogleReady(true);
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.head.appendChild(script);
  }, [googleClientId, onAuthenticated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      onAuthenticated(data.user);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-album-grid">
          {Array.from({ length: 9 }).map((_, index) => (
            <div className={`auth-album auth-album-${index + 1}`} key={index}>
              <Music2 size={index % 2 ? 28 : 38} />
            </div>
          ))}
        </div>
      </section>

      <section className="auth-card">
        <div className="brand-mark">
          <span className="brand-icon">
            <Music2 size={22} />
          </span>
          <span>Spotify Clone</span>
        </div>

        <h1>{mode === "login" ? "Log in to your music" : "Create your account"}</h1>
        <p className="auth-subtitle">
          Upload tracks, build playlists, and keep your listening library synced through MongoDB.
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            onClick={() => setMode("register")}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="field">
              <UserRound size={18} />
              <input
                autoComplete="name"
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name"
                required
                type="text"
                value={name}
              />
            </label>
          )}

          <label className="field">
            <Mail size={18} />
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <Lock size={18} />
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : undefined}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type="password"
              value={password}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-auth-button" disabled={loading} type="submit">
            {loading ? <Loader2 className="spin" size={18} /> : null}
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="auth-divider">
          <span />
          <em>or</em>
          <span />
        </div>

        <div className="google-zone">
          {googleClientId ? (
            <>
              <div ref={googleButtonRef} />
              {!googleReady && <button className="google-fallback" disabled>Loading Google...</button>}
            </>
          ) : (
            <button className="google-fallback" disabled type="button">
              Continue with Google
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

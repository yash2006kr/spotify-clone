"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Mail, Music2, UserRound } from "lucide-react";

import { apiFetch, storeSessionToken } from "@/lib/api";
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
  const [resetAccountFound, setResetAccountFound] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId) {
      return;
    }

    const handleGoogleCredential = async (response: { credential: string }) => {
      setLoading(true);
      setError("");

      try {
        const result = await apiFetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential })
        });
        const data = await result.json();

        if (!result.ok) {
          throw new Error(data.error || "Google sign-in failed.");
        }

        storeSessionToken(data.sessionToken);
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

      googleButtonRef.current.innerHTML = "";
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

    const existingScript = document.getElementById("google-identity-services");
    const script = existingScript || document.createElement("script");

    script.addEventListener("load", renderGoogleButton, { once: true });
    script.addEventListener(
      "error",
      () => setError("Google sign-in could not load. Check your network and Google client ID."),
      { once: true }
    );

    if (existingScript) {
      return;
    }

    script.id = "google-identity-services";
    script.setAttribute("src", "https://accounts.google.com/gsi/client");
    script.setAttribute("async", "true");
    script.setAttribute("defer", "true");
    document.head.appendChild(script);
  }, [googleClientId, onAuthenticated]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setPassword("");
    setResetAccountFound(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "forgot") {
        const result = await apiFetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: email,
            password: resetAccountFound ? password : undefined
          })
        });
        const data = await result.json();

        if (!result.ok) {
          throw new Error(data.error || "Password reset failed.");
        }

        if (!resetAccountFound) {
          setResetAccountFound(true);
          setName(data.name || "");
          return;
        }

        storeSessionToken(data.sessionToken);
        onAuthenticated(data.user);
        return;
      }

      const result = await apiFetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      storeSessionToken(data.sessionToken);
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/spotify-logo.jpeg" />
          </span>
          <span>spotify</span>
        </div>

        <h1>
          {mode === "login"
            ? "Log in to your music"
            : mode === "register"
              ? "Create your account"
              : resetAccountFound
                ? "Choose a new password"
                : "Find your account"}
        </h1>
        <p className="auth-subtitle">
          {mode === "forgot"
            ? "Enter your username or email, then set a new password and jump back into your library."
            : "Upload tracks, build playlists, and keep your listening library synced through MongoDB."}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            onClick={() => switchMode("register")}
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
            {mode === "forgot" ? <UserRound size={18} /> : <Mail size={18} />}
            <input
              autoComplete={mode === "forgot" ? "username" : "email"}
              disabled={mode === "forgot" && resetAccountFound}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={mode === "forgot" ? "Username or email" : "Email"}
              required
              type={mode === "forgot" ? "text" : "email"}
              value={email}
            />
          </label>

          {(mode !== "forgot" || resetAccountFound) && (
            <label className="field">
              <Lock size={18} />
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" || mode === "forgot" ? 8 : undefined}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "forgot" ? "New password" : "Password"}
                required
                type="password"
                value={password}
              />
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="primary-auth-button" disabled={loading} type="submit">
            {loading ? <Loader2 className="spin" size={18} /> : null}
            {mode === "login"
              ? "Log in"
              : mode === "register"
                ? "Create account"
                : resetAccountFound
                  ? "Reset and log in"
                  : "Continue"}
          </button>

          {mode === "login" && (
            <button className="auth-link-button" onClick={() => switchMode("forgot")} type="button">
              Forgot password?
            </button>
          )}
          {mode === "forgot" && (
            <button className="auth-link-button" onClick={() => switchMode("login")} type="button">
              Back to log in
            </button>
          )}
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

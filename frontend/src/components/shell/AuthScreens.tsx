import { Activity, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";

export type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";

export function AuthLoadingScreen() {
  return <main className="auth-shell"><section className="auth-panel"><div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div><h1>Opening your workspace</h1><p>Checking your private session.</p></section></main>;
}

export function AuthSignInScreen(props: {
  authMessage: string; authMode: AuthMode; email: string; password: string; confirmPassword: string; isSubmitting: boolean;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onConfirmPasswordChange: (value: string) => void;
  onModeChange: (mode: AuthMode) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSignUp = props.authMode === "sign-up";
  const isForgot = props.authMode === "forgot-password";
  const isReset = props.authMode === "reset-password";
  const isVerify = props.authMode === "verify-email";
  const title = isSignUp ? "Create your account" : isForgot ? "Reset your password" : isReset ? "Choose a new password" : isVerify ? "Verify your email" : "Welcome back";
  return (
    <main className="auth-shell"><section className="auth-panel">
      <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div><h1>{title}</h1>
      <p>{isSignUp ? "Create an account once, verify your email, then sign in with your password on web or desktop."
        : isForgot ? "Enter your email and we’ll send one secure recovery link."
          : isReset ? "Set the password you’ll use for future sign-ins."
            : isVerify ? <>We sent a one-time verification link to <strong>{props.email}</strong>. After verification, return here and sign in.</>
              : "Sign in with your email and password. We’ll keep you signed in securely on this device."}</p>
      <div className="auth-trust-list" aria-label="Privacy promises"><span><ShieldCheck size={15} /> Private by default</span><span><KeyRound size={15} /> You approve access</span><span><Activity size={15} /> Receipts stay visible</span></div>
      {isVerify ? <div className="auth-sent-state" role="status"><CheckCircle2 size={30} /><strong>Check your inbox once</strong><p>Open the newest verification email. You will not need an email link for normal sign-ins afterward.</p><button className="secondary" onClick={() => props.onModeChange("sign-in")} type="button">Go to sign in</button></div> :
        <form className="auth-form" onSubmit={props.onSubmit}>
          {!isReset ? <label><span>Email</span><input autoComplete="email" inputMode="email" name="email" onChange={(event) => props.onEmailChange(event.currentTarget.value)} placeholder="you@example.com" required spellCheck={false} type="email" value={props.email} /></label> : null}
          {!isForgot ? <label><span>{isReset ? "New password" : "Password"}</span><input autoComplete={isSignUp || isReset ? "new-password" : "current-password"} minLength={8} name="password" onChange={(event) => props.onPasswordChange(event.currentTarget.value)} required type="password" value={props.password} />{isSignUp || isReset ? <small>Use at least 8 characters.</small> : null}</label> : null}
          {isSignUp || isReset ? <label><span>Confirm password</span><input autoComplete="new-password" minLength={8} name="confirm-password" onChange={(event) => props.onConfirmPasswordChange(event.currentTarget.value)} required type="password" value={props.confirmPassword} /></label> : null}
          <button disabled={props.isSubmitting} type="submit">{isForgot ? <Mail size={16} /> : <KeyRound size={16} />}{props.isSubmitting ? "Please wait…" : isSignUp ? "Create account" : isForgot ? "Send recovery email" : isReset ? "Save new password" : "Sign in"}</button>
        </form>}
      {props.authMessage ? <p className="auth-message" role="status">{props.authMessage}</p> : null}
      {!isVerify ? <div className="auth-switcher">{isSignUp ? <button className="text-button" onClick={() => props.onModeChange("sign-in")} type="button">Already have an account? Sign in</button> : isForgot || isReset ? <button className="text-button" onClick={() => props.onModeChange("sign-in")} type="button">Back to sign in</button> : <><button className="text-button" onClick={() => props.onModeChange("sign-up")} type="button">New here? Create an account</button><button className="text-button" onClick={() => props.onModeChange("forgot-password")} type="button">Forgot password?</button></>}</div> : null}
    </section></main>
  );
}

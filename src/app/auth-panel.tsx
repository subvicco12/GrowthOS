'use client';
import * as React from 'react';
import { useState } from 'react';

export function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  async function submit(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response=await fetch('/api/auth/login',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      if(!response.ok) throw Error(response.status===429?'Too many attempts. Try later.':response.status===401?'Email or password was not accepted.':'Sign-in unavailable.');
      setPassword(''); onAuthenticated();
    } catch(error) { setMessage(error instanceof Error?error.message:'Sign-in unavailable.'); }
    finally { setBusy(false); }
  }
  return <main className="authShell"><form className="panel authForm" onSubmit={event=>void submit(event)}>
    <p className="eyebrow">GROWTHOS</p><h1>Sign in</h1><p>Use an existing authorized account. Public registration is unavailable.</p>
    <label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={320}/>
    <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={1024}/>
    <button disabled={busy} type="submit">{busy?'Signing in…':'Sign in'}</button>{message&&<p role="alert">{message}</p>}
  </form></main>;
}

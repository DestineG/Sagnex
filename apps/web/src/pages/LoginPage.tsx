import { FormEvent, useState } from 'react';
import { MailCheck, Send } from 'lucide-react';
import { api } from '../api';

interface LoginPageProps {
  onAuthenticated: () => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api.requestLoginCode(email);
      setSent(true);
      setMessage('验证码已发送，请检查邮箱。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证码发送失败');
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api.verifyLoginCode(email, code);
      onAuthenticated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证码校验失败');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-panel">
      <div className="auth-mark"><img src="/sagnex-mark.svg" alt="" /></div>
      <p className="eyebrow">SAGNEX</p>
      <h1>验证后继续</h1>
      <p className="auth-copy">使用启动配置中的邮箱接收一次性验证码。</p>
      {!sent ? <form onSubmit={requestCode} className="auth-form">
        <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required placeholder="name@example.com" /></label>
        <button className="button primary" type="submit" disabled={busy}><Send />{busy ? '发送中…' : '发送验证码'}</button>
      </form> : <form onSubmit={verify} className="auth-form">
        <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>验证码<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} autoFocus required /></label>
        <button className="button primary" type="submit" disabled={busy}><MailCheck />{busy ? '验证中…' : '登录'}</button>
        <button className="button subtle-button" type="button" onClick={() => { setSent(false); setCode(''); setMessage(''); }}>更换邮箱</button>
      </form>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </section>
  </main>;
}

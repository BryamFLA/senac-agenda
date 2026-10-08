'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setAviso(null); setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) setErro('E-mail ou senha incorretos.');
  }

  async function esqueci() {
    setErro(null); setAviso(null);
    if (!email.trim()) { setErro('Digite seu e-mail primeiro.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) setErro('Não foi possível enviar o e-mail agora.');
    else setAviso('Se o e-mail tiver acesso, você vai receber um link para criar uma nova senha.');
  }

  return (
    <main className="login">
      <form onSubmit={entrar} className="login-card">
        <span className="marca-icone grande" aria-hidden="true" />
        <h1>Agenda SENAC</h1>
        <p className="muted">SENAC Francisco Beltrão</p>
        <label className="campo">E-mail
          <input type="email" autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">Senha
          <input type="password" autoComplete="current-password" value={senha}
                 onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        <button type="submit" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={esqueci}>Esqueci minha senha</button>
      </form>
    </main>
  );
}

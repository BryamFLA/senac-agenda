'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Aparece quando a pessoa chega pelo link de "esqueci minha senha" ou de convite. */
export default function NovaSenha({ onPronto }: { onPronto: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) { setErro('Use pelo menos 8 caracteres.'); return; }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) setErro('Não foi possível salvar a senha.'); else onPronto();
  }

  return (
    <main className="login">
      <form onSubmit={salvar} className="login-card">
        <h1>Criar nova senha</h1>
        <label className="campo">Nova senha
          <input type="password" autoComplete="new-password" value={senha}
                 onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button type="submit">Salvar senha</button>
      </form>
    </main>
  );
}

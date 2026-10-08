'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORES, PAPEIS, Papel, Usuario, mensagemErro } from '@/lib/types';
import { useCadastros } from './Contexto';
import Modal, { SeletorCor } from './Modal';

async function chamar(corpo: object): Promise<string | null> {
  const { error } = await supabase.functions.invoke('usuarios', { body: corpo });
  if (!error) return null;
  try { return (await (error as { context: Response }).context.json()).erro ?? error.message; } catch { return error.message; }
}

function senhaAleatoria(): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => a[n % a.length]).join('');
}

const nomePapel = (p: Papel) => PAPEIS.find((x) => x.id === p)?.nome ?? p;

export default function Pessoas() {
  const cad = useCadastros();
  const [editar, setEditar] = useState<Usuario | 'novo' | null>(null);
  const lista = [...cad.usuarios].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h2>Pessoas</h2>
          <p className="muted">Quem acessa o sistema. TEPTs montam a agenda; instrutores veem a própria agenda e marcam material e PTD.</p>
        </div>
        <span className="flex" />
        <button onClick={() => setEditar('novo')}>+ Novo acesso</button>
      </header>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Dá aula</th><th>Situação</th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className="clicavel" onClick={() => setEditar(u)}>
                <td><span className="bolinha-inline" style={{ background: u.cor }} /> {u.nome}</td>
                <td className="muted">{u.email}</td>
                <td>{nomePapel(u.papel)}</td>
                <td>{u.leciona ? 'Sim' : '—'}</td>
                <td>{u.ativo ? 'Ativo' : <span className="muted">Inativo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editar && <EditarPessoa usuario={editar === 'novo' ? null : editar} onClose={() => setEditar(null)} />}
    </section>
  );
}

function EditarPessoa({ usuario, onClose }: { usuario: Usuario | null; onClose: () => void }) {
  const cad = useCadastros();
  const souAdmin = cad.eu.papel === 'admin';
  const [f, setF] = useState({
    nome: usuario?.nome ?? '', email: usuario?.email ?? '', papel: usuario?.papel ?? ('instrutor' as Papel),
    leciona: usuario?.leciona ?? true, cor: usuario?.cor ?? CORES[0], ativo: usuario?.ativo ?? true,
  });
  const [senha, setSenha] = useState(usuario ? '' : senhaAleatoria());
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const papeis = PAPEIS.filter((p) => p.id !== 'admin' || souAdmin || usuario?.papel === 'admin');
  const bloqueado = usuario?.papel === 'admin' && !souAdmin;

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome.');
    setSalvando(true);
    if (!usuario) {
      const e = await chamar({ acao: 'criar', ...f, leciona: f.papel === 'instrutor' || f.leciona, senha });
      setSalvando(false);
      if (e) return setErro(e);
      setAviso(`Acesso criado. Passe para ${f.nome.split(' ')[0]}: e-mail ${f.email.trim().toLowerCase()} e senha ${senha}`);
      await cad.recarregar();
      return;
    }
    const { error } = await supabase.from('usuarios').update({
      nome: f.nome.trim(), papel: f.papel, leciona: f.papel === 'instrutor' || f.leciona, cor: f.cor, ativo: f.ativo,
    }).eq('id', usuario.id);
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    await cad.recarregar();
    onClose();
  }

  async function trocarSenha() {
    if (!usuario) return;
    setErro(null); setAviso(null);
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    const e = await chamar({ acao: 'senha', id: usuario.id, senha });
    if (e) return setErro(e);
    setAviso(`Senha trocada. Nova senha: ${senha}`);
  }

  if (aviso && !usuario) {
    return (
      <Modal titulo="Acesso criado" onClose={onClose} rodape={<><span className="flex" /><button onClick={onClose}>Pronto</button></>}>
        <p className="nota">{aviso}</p>
        <p className="muted">Anote agora: a senha não fica visível depois. A pessoa entra em agenda.bryam.com.br.</p>
      </Modal>
    );
  }

  return (
    <Modal titulo={usuario ? usuario.nome : 'Novo acesso'} subtitulo={usuario?.email} onClose={onClose}
           rodape={<><span className="flex" /><button className="secundario" onClick={onClose}>Cancelar</button>
             <button onClick={salvar} disabled={salvando || bloqueado}>{salvando ? 'Salvando…' : usuario ? 'Salvar' : 'Criar acesso'}</button></>}>
      {bloqueado && <p className="muted">Só o administrador altera este usuário.</p>}
      <label className="campo">Nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} disabled={bloqueado} /></label>
      {!usuario && <label className="campo">E-mail<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>}
      <label className="campo">Papel
        <select value={f.papel} disabled={bloqueado} onChange={(e) => setF({ ...f, papel: e.target.value as Papel, leciona: e.target.value === 'instrutor' ? true : f.leciona })}>
          {papeis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      {f.papel !== 'instrutor' && (
        <label className="check"><input type="checkbox" checked={f.leciona} disabled={bloqueado} onChange={(e) => setF({ ...f, leciona: e.target.checked })} /> Também dá aula (aparece como instrutor)</label>
      )}
      <div className="campo"><span>Cor na agenda das turmas</span><SeletorCor cores={CORES} valor={f.cor} onChange={(cor) => setF({ ...f, cor })} /></div>
      {usuario && <label className="check"><input type="checkbox" checked={f.ativo} disabled={bloqueado || usuario.id === cad.eu.id} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Acesso ativo</label>}
      <div className="campo">
        <span>{usuario ? 'Nova senha' : 'Senha inicial'}</span>
        <div className="horas">
          <input value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 8 caracteres" disabled={bloqueado} />
          <button type="button" className="secundario" onClick={() => setSenha(senhaAleatoria())} disabled={bloqueado}>Gerar</button>
          {usuario && <button type="button" className="secundario" onClick={trocarSenha} disabled={bloqueado || !senha}>Trocar</button>}
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {aviso && <p className="aviso">{aviso}</p>}
    </Modal>
  );
}

"""Importação única da aba 2026 de 'Bryam Agenda.xlsx' para o Supabase.

Uso: python3 import_excel.py "<caminho>/Bryam Agenda.xlsx" saida.json
Gera {compromissos:[...], agenda:[...]} para carga no banco.

Leitura da grade: cada semana é uma linha de datas (SEG..SÁB, formato dd/mm,
ano em cache errado) seguida das seções M/T/N, cada célula com até 3 linhas:
nome / subtítulo (código, PSG, INTEC...) / horário. O turno é decidido pelo
horário quando existe (início <12h = M, <18h = T, senão N), porque em algumas
semanas os rótulos M/T/N estão desalinhados.
"""
import openpyxl, datetime, json, re, sys, collections

SHEET, FIRST_ROW = '2026', 2384
TIME = re.compile(r'(\d{1,2})[:h](\d{2})(?::\d{2})?(?:\s*(?:às|ás|as|a)\s*(\d{1,2})[:h](\d{2}))?')

# nome na planilha -> (compromisso no catálogo, observação extra opcional)
def classify(name, rest):
    n = name.lower()
    extra = ' / '.join(rest) or None
    if n.startswith('técnico inf'):            return 'Técnico Inf. Internet', None
    if n.startswith('técnico ia'):             return 'Técnico IA - Seed', None
    if n.startswith('programador web'):        return 'Programador Web', None
    if n.startswith('aula do programador'):    return 'Programador Web', extra
    if n.startswith('assistente de t'):        return 'Assistente de TI', None
    if 'instagran' in n or 'instagram' in n:   return 'Instagram para Negócios', None
    if 'mídias sociais' in n:
        t2 = n.startswith('2.') or any('T2' in r for r in rest)
        return ('Criação de Mídias Sociais T2' if t2 else 'Criação de Mídias Sociais T1'), None
    if n.startswith('assistente administrativo'): return 'Assistente Administrativo Flexível', None
    if n.startswith('cabeleireiro'):           return 'Cabeleireiro', None
    if 'confeitaria' in n:                     return 'Auxiliar de Confeitaria', None
    if n.startswith('aprendizagem - adm'):     return 'Aprendizagem Administrativo', None
    if n.startswith('aprendizagem vendas'):    return 'Aprendizagem Vendas', None
    if n.startswith('férias'):                 return 'Férias', None
    if n.startswith('expediente a partir'):    return 'Feriado', ' / '.join(rest[1:] + [name]) or None
    if n.startswith('feriado'):
        obs = name[7:].strip() or extra
        return 'Feriado', obs
    if n.startswith(('recesso', 'day off', 'dispensa', 'limpeza')):
        return 'Folga', ' / '.join([name] + rest)
    if n.startswith('viagem'):                 return 'Viagem', extra
    if n.startswith('workshop'):               return 'Workshop', ' / '.join(([name[8:].strip()] if name[8:].strip() else []) + rest) or None
    if n.startswith('inteligencia artificial'):return 'Workshop', ' / '.join(['Inteligência Artificial'] + rest)
    if n.startswith('palestra'):               return 'Palestra', extra
    if n.startswith('reunião'):                return 'Reunião', name
    if 'semana' in n and ('formação' in n or 'pedagógica' in n): return 'Formação pedagógica', name
    if n.startswith('ia - ptd'):               return 'Planejamento', ' / '.join([name] + rest)
    return 'Evento', ' / '.join([name] + rest)

CATALOGO = [
  # nome, subtitulo, codigo, tipo, inicio, fim
  ('Técnico Inf. Internet', '202500002', '202500002', 'aula', '19:00', '22:00'),
  ('Técnico IA - Seed', '202600039', '202600039', 'aula', '12:15', '17:15'),
  ('Programador Web', 'PSG', '202600015', 'aula', '13:30', '17:30'),
  ('Assistente de TI', 'PSG', '202600138', 'aula', '13:30', '17:30'),
  ('Instagram para Negócios', 'INTEC', None, 'aula', '19:00', '22:00'),
  ('Criação de Mídias Sociais T1', 'T1 - INTEC', None, 'aula', '19:00', '22:00'),
  ('Criação de Mídias Sociais T2', 'T2 - INTEC', None, 'aula', '19:00', '22:00'),
  ('Assistente Administrativo Flexível', 'PSG', None, 'aula', '13:30', '17:30'),
  ('Cabeleireiro', 'PSG', None, 'aula', '13:30', '17:30'),
  ('Auxiliar de Confeitaria', 'PSG', None, 'aula', '13:30', '17:30'),
  ('Aprendizagem Administrativo', '202500121', '202500121', 'aula', '13:30', '17:30'),
  ('Aprendizagem Vendas', '202500122', '202500122', 'aula', '13:30', '17:30'),
  ('Planejamento', None, None, 'planejamento', None, None),
  ('Workshop', None, None, 'evento', None, None),
  ('Palestra', None, None, 'evento', None, None),
  ('Reunião', None, None, 'evento', None, None),
  ('Formação pedagógica', None, None, 'evento', None, None),
  ('Viagem', None, None, 'evento', None, None),
  ('Evento', None, None, 'evento', None, None),
  ('Feriado', None, None, 'feriado', None, None),
  ('Férias', None, None, 'ferias', None, None),
  ('Folga', None, None, 'folga', None, None),
]

def s(c):
    if c is None: return ''
    if isinstance(c, float) and c.is_integer(): c = int(c)
    if isinstance(c, datetime.time): c = c.strftime('%H:%M')
    return re.sub(r'\s+', ' ', str(c)).strip()

def parse_time(t):
    m = TIME.search(t)
    if not m or TIME.sub('', t).strip(' ()h0123456789') not in ('',):
        # linha não é só horário
        if not m or len(TIME.sub('', t).strip()) > 6: return None
    a = f'{int(m.group(1)):02d}:{m.group(2)}'
    b = f'{int(m.group(3)):02d}:{m.group(4)}' if m.group(3) else None
    return a, b

def turno_by_time(h):
    hh = int(h[:2])
    return 'M' if hh < 12 else ('T' if hh < 18 else 'N')

def main(path, outp):
    ws = openpyxl.load_workbook(path, data_only=True)[SHEET]
    rows = list(ws.iter_rows(values_only=True))
    entries, warns = [], []
    i = FIRST_ROW - 1
    while i < len(rows):
        r = rows[i]
        if len([c for c in r[1:7] if isinstance(c, datetime.datetime)]) < 3:
            i += 1; continue
        dates = {}
        for k, c in enumerate(r[1:7]):
            if isinstance(c, datetime.datetime):
                y = 2026
                if c.month == 12 and i < FIRST_ROW + 5: y = 2025
                if c.month == 1 and i > len(rows) - 30: y = 2027
                d = datetime.date(y, c.month, c.day)
                if d.weekday() != k: warns.append(f'linha {i+1}: {d} não cai na coluna {k}')
                dates[k] = d
        j = i + 1; block = []
        while j < len(rows) and len([c for c in rows[j][1:7] if isinstance(c, datetime.datetime)]) < 3:
            block.append(rows[j]); j += 1
        # rótulo de seção por linha
        labels, cur = [], 'M'
        for rr in block:
            if s(rr[0]) in ('M', 'T', 'N'): cur = s(rr[0])
            labels.append(cur)
        for k, d in dates.items():
            cells = [(labels[x], s(block[x][k + 1])) for x in range(len(block))]
            open_lines, open_sec = [], None
            def close(tm=None):
                nonlocal open_lines, open_sec
                if not open_lines and not tm: return
                if not open_lines:
                    warns.append(f'{d}: horário solto {tm}'); open_lines, open_sec = [], None; return
                name, rest = open_lines[0], open_lines[1:]
                comp, obs = classify(name, rest)
                t = turno_by_time(tm[0]) if tm else open_sec
                entries.append({'data': str(d), 'turno': t, 'compromisso': comp,
                                'hora_inicio': tm[0] if tm else None,
                                'hora_fim': tm[1] if tm else None,
                                'observacao': obs, 'origem': f'linha {i+1}'})
                open_lines, open_sec = [], None
            prev_sec = None
            for idx, (sec, txt) in enumerate(cells):
                if sec != prev_sec and open_lines:
                    nxt = next((t for sc, t in cells[idx:] if t), '')
                    if not parse_time(nxt) and nxt: close()
                prev_sec = sec
                if not txt: continue
                tm = parse_time(txt)
                if tm and not TIME.sub('', txt).strip(' ()h'):
                    close(tm)
                elif tm and len(TIME.sub('', txt).strip()) <= 6:
                    close(tm)
                else:
                    if not open_lines: open_sec = sec
                    open_lines.append(txt)
            close()
        i = j
    # dedupe (data, turno): mantém o primeiro e avisa
    seen, final = {}, []
    for e in entries:
        key = (e['data'], e['turno'])
        if key in seen:
            warns.append(f"{key}: dois compromissos no mesmo turno ({seen[key]['compromisso']} | {e['compromisso']}) — mantido o primeiro, segundo vai para observação")
            o = seen[key]; o['observacao'] = ' / '.join(x for x in [o['observacao'], e['compromisso'] + (f" ({e['hora_inicio']}–{e['hora_fim']})" if e['hora_inicio'] else '')] if x)
            continue
        seen[key] = e; final.append(e)
    # horário fora do padrão: fim ausente
    cat = [dict(zip(['nome','subtitulo','codigo_turma','tipo','hora_inicio_padrao','hora_fim_padrao'], c)) for c in CATALOGO]
    json.dump({'compromissos': cat, 'agenda': final}, open(outp, 'w'), ensure_ascii=False, indent=1)
    print('registros', len(final), '| avisos', len(warns))
    for w in warns: print(' -', w)
    print(collections.Counter(e['compromisso'] for e in final).most_common())

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

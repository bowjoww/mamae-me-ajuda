# Itens aguardando autorização do user

> Cada item aqui é uma decisão que **não tomo sozinho em auto mode** — risco de prod, segredo, ou mudança destrutiva.
> Quando o user voltar, ler esta lista e dar go/no-go.

## Hotfix do Henrique (alta prioridade)
**Sha:** `bb8c5b2` · **Preview:** `mamae-me-ajuda-ezl1dn8z2-jofederici-1412s-projects.vercel.app`

Conteúdo:
1. Chat 500 silencioso → `console.error` no catch + erro 429 amigável pra rate/quota
2. StatusBar mostra "APRENDIZ III" pra perfil zerado → esconde divisão quando totalXp=0
3. /prova sem trocar de matéria → botão "Trocar prova" no header da expedição ativa

**Comando:** `cd C:/Projetos/mamae-me-ajuda && vercel --prod --yes`
**Status:** aguardando "Ok, pode promover" / "Vai" / "Sim"

## Swap pra GPT-5.5
**Confirmado real:** lançado 2026-04-23, model id `gpt-5.5-2026-04-23`, $5/$30 por 1M tokens, 1M context.

**Comando:**
```bash
cd C:/Projetos/mamae-me-ajuda
vercel env add OPENAI_MODEL production   # value: gpt-5.5-2026-04-23
vercel env add AI_PROVIDER production    # value: openai
vercel --prod --yes
```

**Risco:** se a OPENAI_API_KEY não tiver acesso ao 5.5 ainda, chat 401a. Rollback fácil: remover as duas envs ou voltar `AI_PROVIDER=gemini`. Mitigação: o `console.error` novo (parte do hotfix bb8c5b2) vai mostrar o 401 explicitamente nos runtime logs.

**Status:** aguardando "Ok, pode trocar"

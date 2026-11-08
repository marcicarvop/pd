# PRD — Sistema POS Assunção & Paladini

## Problema (pedido do usuário, literal)
Crie um sistema web para padaria e lanchonete com as seguintes funcionalidades:
1. Autenticação com dois perfis: operador de caixa e gerente.
2. Cardápio: cadastro de produtos com variações (ex: tamanhos, ingredientes - pizzas).
3. Pedidos e comanda: abertura de comanda por mesa/atendimento.
4. Caixa: fechamento de vendas (dinheiro, cartão, pix), resumo imprimível.
5. Fiado: controle do saldo devedor de clientes.
6. Encomendas: pedidos futuros.
7. Estoque: alerta de quantidade baixa.
Requisitos: 100% offline (instalação em PC local); customização de pizza (meio-a-meio).
Pedido adicional: exportar como aplicativo Windows com instalador .exe e .msi.

## Perfis
- Gerente: Caixa, Comandas, Cardápio, Insumos, Produção, Revenda, Fiado, Encomendas, Dashboard, Usuários.
- Operador: Caixa, Comandas, Fiado, Encomendas.

## Arquitetura
- Backend: FastAPI + MongoDB; JWT custom + Bcrypt; PIN de 4 dígitos único; fuso America/Sao_Paulo.
- Frontend: React + Shadcn UI; Tailwind.
- Sem integrações de terceiros (requisito offline). Nome/logo: Assunção & Paladini — Padaria · Lanchonete · Pizzaria.
- Desktop: `desktop/launcher.py` (pywebview) inicia mongod embarcado + uvicorn in-process e abre janela própria.

## Modelo de estoque (3 camadas)
- Insumos (matéria-prima), Revenda (itens de prateleira), Produção (produtos feitos pela casa com lote e validade FIFO).
- "Produzir lote" consome insumos pela ficha técnica; venda baixa de Revenda ou Pronto; pizza meio-a-meio divide por sabor.

## Ficha técnica no Cardápio
- Produto não-pizza: `recipe` com insumos × quantidade.
- Pizza: `base_recipe` + `recipe_by_flavor` por sabor.
- Margem % individual, Custo e Preço sugerido exibidos.

## Implementado (2026-11-05 / 2026-11-06)
- Login, cardápio, comandas, caixa, cupom, fiado, encomendas, estoque em 3 abas, produção com FIFO e descarte, cascade delete.
- 97/97 pytest + smoke frontend 100% (iteration_6).
- Pacote desktop: `desktop/launcher.py`, `desktop/server.spec`, `installer/inno-setup.iss`, `installer/wix/Product.wxs`, workflow `.github/workflows/build-windows.yml` que gera `.exe` + `.msi` e publica como Release.
- Backend ganhou mount opcional para servir o build React quando `SERVE_FRONTEND=1`.

## Backlog (P1/P2)
- P1: Testar o workflow Windows no primeiro push e corrigir hidden-imports do PyInstaller que aparecerem.
- P1: @media print no cupom (80mm).
- P1: Impedir estoque negativo em saída manual (ou avisar).
- P2: Movimento manual em prontos deveria criar um lote implícito.
- P2: Assinatura de código (code signing) para o .exe/.msi.
- P2: Auto-update (electron-updater equivalente via GitHub Releases + sparkle-like).
- P2: Shadcn Calendar na validade; KDS; backup .json.

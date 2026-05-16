# Plano de Testes Automatizados — IAO (Infinity Agent Orchestrator)

> Checklist exaustiva de todos os testes automatizados necessários para garantir o
> funcionamento de todas as funcionalidades atuais da plataforma. Cada item é um
> teste (ou um pequeno grupo coeso de asserções) que deve existir co-localizado
> junto ao código que ele cobre (`<arquivo>.test.ts(x)`), conforme `.agents/rules/testing.md`.
>
> Stack: **Vitest** + **@testing-library/react** + **jsdom**. Mocks no boundary
> (`node-pty`, `better-sqlite3`, `electron`, `window.ptyApi`, `window.dbApi`,
> `window.dialogApi`). Nenhum teste deve abrir pty real ou DB real.

---

## 1. Estrutura / Build / Configuração

- [x] `electron.vite.config.ts` resolve os três build targets (`main`, `preload`, `renderer`)
- [x] Aliases `@shared`, `@main`, `@renderer` resolvem corretamente em runtime de testes
- [x] `tsconfig.json` paths coincidem com os aliases do Vite
- [x] `npm run build` gera os bundles esperados sem erros TypeScript
- [x] `package.json` declara `node-pty` e `better-sqlite3` como dependências nativas (`postinstall`)
- [x] Nenhuma importação cruza fronteiras proibidas (`renderer` → `main`, `main` → `renderer`, `preload` → `renderer`) — teste arquitetural por regex/AST

## 2. Tipos compartilhados (`src/shared/`)

- [x] `IpcChannels` contém todos os canais usados em main + preload (consistência de chaves)
- [x] Nenhum string literal de canal IPC aparece fora de `@shared/types/ipc`
- [x] `TerminalRecord` e `EdgeRecord` casam com o schema do SQLite (campos e tipos)
- [x] `ShellType` aceita apenas `'default' | 'bash' | 'zsh'`
- [x] Contratos de `window.ptyApi`, `window.dbApi`, `window.dialogApi` em `api.ts` casam com o `contextBridge` do preload

## 3. Main process — `pty.service.ts`

- [x] `resolveShell('bash')` retorna caminho absoluto quando bash existe no PATH
- [x] `resolveShell('zsh')` faz fallback para `$SHELL`/bash/sh quando zsh não existe
- [x] `resolveShell('default')` retorna `process.env.SHELL`
- [x] `resolveShell()` faz fallback final para `/bin/sh` quando nada é encontrado
- [x] `findOnPath` retorna `null` para binário inexistente e caminho absoluto quando encontrado
- [x] `createPty` usa `cwd` quando o diretório existe, senão `os.homedir()`
- [x] `createPty` registra a sessão IAO quando `args.nodeId` é fornecido
- [x] `createPty` NÃO registra sessão IAO quando `nodeId` é ausente
- [x] `createPty` prepende `IAO_CLI_DIR` ao `PATH` do shell filho
- [x] `createPty` injeta env vars (`IAO_PORT`, `IAO_TOKEN`, `IAO_NODE_ID`, etc.)
- [x] `createPty` escreve `args.command + \r` no pty após 250ms quando `command` é fornecido
- [x] `createPty` NÃO escreve comando quando `args.command` é vazio
- [x] `createPty` continua mesmo se `ensureIAOSkill` lançar (best-effort)
- [x] `onData` do pty chama `iaoService.appendOutput(nodeId, data)` quando `nodeId` está presente
- [x] `onData` invoca o callback `onData` do chamador
- [x] `onExit` chama `unregisterPtySession`, callback `onExit` e remove do mapa interno
- [x] `writeToPty` em id inexistente não lança
- [x] `resizePty` ignora erros silenciosamente após o pty já ter saído
- [x] `resizePty` garante `cols >= 1` e `rows >= 1`
- [x] `killPty` desregistra sessão IAO, mata o pty e remove do mapa
- [x] `killAllPtys` mata todos os ptys ativos e limpa o mapa

## 4. Main process — `db.service.ts`

- [x] `initDb` cria tabelas `terminals` e `edges` se ausentes
- [x] `initDb` habilita WAL journal mode
- [x] `listActiveTerminals` retorna apenas registros com `active = 1`, ordenados por `created_at`
- [x] `upsertTerminal` insere novo registro com todos os campos
- [x] `upsertTerminal` atualiza registro existente preservando `created_at`
- [x] `upsertTerminal` define `active = 1` em re-inserções
- [x] `removeTerminal` deleta o registro pelo id
- [x] `removeTerminal` cascateia removendo edges com `source` ou `target` correspondente
- [x] `listEdges` retorna todas as edges ordenadas por `created_at`
- [x] `upsertEdge` insere e atualiza edge corretamente
- [x] `removeEdge` deleta por id sem afetar outras edges
- [x] FK `ON DELETE CASCADE` da tabela edges remove edges órfãs quando o terminal é removido

## 5. Main process — `iao.service.ts` (servidor HTTP IAO)

### Inicialização / bundle
- [x] `startIaoServer` faz bind em `127.0.0.1` em porta efêmera
- [x] `startIaoServer` retorna a porta após listening
- [x] `startIaoServer` é idempotente (chamadas subsequentes retornam mesma porta)
- [x] `stopIaoServer` fecha o servidor e limpa todas as sessões/buffers
- [x] `ensureBundle` escreve `cli.cjs` e `iao` em `userData/iao-cli` com permissões corretas (0o755 no wrapper)
- [x] `ensureBundle` é idempotente (segunda chamada não reescreve)

### Sessões
- [x] `registerPtySession` gera token hex de 48 chars
- [x] `registerPtySession` mapeia token ↔ entry e ptyId ↔ entry
- [x] `registerPtySession` zera o buffer de output do node
- [x] `unregisterPtySession` remove ambos os mapeamentos
- [x] `unregisterPtySession` é no-op em ptyId desconhecido

### Buffer de output
- [x] `appendOutput` concatena chunks em ordem
- [x] `appendOutput` corta o buffer ao `MAX_BUFFER` (64KB) preservando o trecho mais recente
- [x] `clearOutput` remove o buffer de um node

### Segurança HTTP
- [x] Requisição de IP não-loopback responde 403
- [x] Aceita `127.0.0.1`, `::1` e `::ffff:127.0.0.1` como loopback
- [x] Sem header `Authorization` responde 401
- [x] Token inválido responde 401
- [x] Token válido após `unregisterPtySession` é rejeitado (401)
- [x] Body acima de 1.000.000 bytes é rejeitado

### Rotas
- [x] `GET /agents` retorna `self` + lista de agentes ligados (via edges)
- [x] `GET /agents` retorna lista vazia quando não há edges
- [x] `GET /agents` exclui o próprio caller da lista
- [x] `GET /agents` inclui apenas terminais com `active = 1`
- [x] `POST /send` exige `target` e `prompt` (400 caso contrário)
- [x] `POST /send` retorna 404 quando nome não casa nenhum agente ligado
- [x] `POST /send` resolve por exact match case-insensitive
- [x] `POST /send` resolve por substring quando há único candidato
- [x] `POST /send` retorna 404 quando substring é ambígua
- [x] `POST /send` retorna 409 quando agente não tem pty ativo
- [x] `POST /send` escreve prompt e depois `\r` separado por 50ms (bracketed-paste fix)
- [x] `POST /send` retorna `{ delivered: true, target }` no sucesso
- [x] `GET /inspect` exige `target` (400)
- [x] `GET /inspect` retorna 404 quando target não é ligado
- [x] `GET /inspect` retorna `output` com ANSI/CSI/OSC removidos e `bytes` brutos
- [x] `GET /debug` retorna self, port, cli paths, linked agents e buffered_bytes
- [x] Método/rota desconhecidos retornam 404
- [x] JSON body inválido retorna 500

### Helpers
- [x] `stripAnsi` remove CSI (`\x1B[…m`)
- [x] `stripAnsi` remove OSC (`\x1B]…\x07`)
- [x] `stripAnsi` remove DCS/SOS/PM/APC
- [x] `stripAnsi` preserva newlines (`\n`) e tabs (`\t`)
- [x] `stripAnsi` remove caracteres de controle não imprimíveis
- [x] `resolveLinkedAgent` exact match tem prioridade sobre partial
- [x] `resolveLinkedAgent` retorna undefined quando partial é ambíguo

## 6. Main process — `skill.service.ts`

- [x] `ensureIAOSkill` cria `SKILL.md` em `~/.codex/skills/iao/` se ausente
- [x] `ensureIAOSkill` cria `SKILL.md` em `~/.claude/skills/iao/` se ausente
- [x] `ensureIAOSkill` NÃO sobrescreve arquivos existentes (preserva customizações)
- [x] `ensureIAOSkill` retorna o path do Codex (primário)
- [x] `ensureIAOSkill` ignora `projectPath` (instalação é user-global desde a refatoração)
- [x] `ensureIAOSkill` lança quando template fonte está ausente
- [x] `skillPathFor` retorna o caminho esperado para um projeto qualquer

## 7. Main process — IPC handlers

### `pty.ipc.ts`
- [x] `pty:create` invoca `ptyService.createPty` com args + callbacks que enviam `pty:data`/`pty:exit` para o `BrowserWindow`
- [x] `pty:input` chama `writeToPty(id, data)`
- [x] `pty:resize` chama `resizePty(id, cols, rows)`
- [x] `pty:kill` chama `killPty(id)`
- [x] Canais usam strings centralizadas em `IpcChannels`

### `db.ipc.ts`
- [x] `db:list-active` chama `dbService.listActiveTerminals`
- [x] `db:upsert` chama `dbService.upsertTerminal` com payload válido
- [x] `db:remove` chama `dbService.removeTerminal(id)`
- [x] `edges:list` retorna `dbService.listEdges`
- [x] `edges:upsert` chama `dbService.upsertEdge`
- [x] `edges:remove` chama `dbService.removeEdge(id)`

### `dialog.ipc.ts`
- [x] `dialog:select-folder` abre dialog Electron e retorna primeiro path selecionado
- [x] Retorna `null` quando o usuário cancela

### `ipc/index.ts`
- [x] Registra todos os handlers de cada domínio (pty, db, dialog)
- [ ] Desregistra handlers no shutdown / before-quit

## 8. Main process — `index.ts` / `window.ts`

- [x] `app.whenReady` inicializa db, inicia servidor IAO e cria janela
- [x] `before-quit` chama `killAllPtys` e `stopIaoServer`
- [x] `BrowserWindow` é criada com `contextIsolation: true` e `nodeIntegration: false`
- [x] Preload script é carregado pelo path correto
- [x] App fecha completamente em todas as plataformas quando última janela fecha

## 9. Preload

- [x] `contextBridge.exposeInMainWorld` expõe `ptyApi`, `dbApi`, `dialogApi`
- [x] `ptyApi.create` faz `ipcRenderer.invoke('pty:create', args)`
- [x] `ptyApi.input` faz `ipcRenderer.send('pty:input', …)`
- [x] `ptyApi.resize` faz `ipcRenderer.send('pty:resize', …)`
- [x] `ptyApi.kill` faz `ipcRenderer.send('pty:kill', …)`
- [x] `ptyApi.onData` registra listener e retorna unsubscriber funcional
- [x] `ptyApi.onExit` registra listener e retorna unsubscriber funcional
- [x] `dbApi.listActive`, `upsert`, `remove` mapeiam para os canais corretos
- [x] `dbApi.edgesList`, `edgesUpsert`, `edgesRemove` mapeiam para os canais corretos
- [x] `dialogApi.selectFolder` invoca canal correto
- [x] Preload NÃO expõe `ipcRenderer` diretamente (apenas APIs nomeadas)
- [x] Preload NÃO importa nada de `@renderer` ou `@main`

## 10. Renderer — `lib/id.ts`

- [x] `createTerminalId` retorna string única em chamadas sucessivas
- [x] IDs gerados são válidos para uso como chave React

## 11. Renderer — `hooks/useLocalStorage.ts`

- [ ] Lê valor inicial do `localStorage` quando existe
- [ ] Usa fallback quando chave ausente
- [ ] Persiste no `localStorage` ao atualizar
- [ ] Funciona com tipos primitivos (string, boolean, number)
- [ ] Funciona com objetos / Records
- [ ] Lida com JSON inválido sem quebrar (retorna fallback)
- [ ] Múltiplas instâncias da mesma chave sincronizam após update

## 12. Renderer — `features/terminals/services/terminalRepository.ts`

- [ ] `listActive` chama `window.dbApi.listActive` e mapeia `TerminalRecord` → `TerminalNodeData`
- [ ] `persist` mapeia `TerminalNodeData` → `TerminalRecord` e chama `window.dbApi.upsert`
- [ ] `remove(id)` chama `window.dbApi.remove(id)`

## 13. Renderer — `features/canvas/services/edgeRepository.ts`

- [ ] `list` chama `window.dbApi.edgesList`
- [ ] `persist` chama `window.dbApi.edgesUpsert`
- [ ] `remove(id)` chama `window.dbApi.edgesRemove`

## 14. Renderer — `features/terminals/hooks/useTerminals.ts`

- [ ] Estado inicial é `[]`
- [ ] `listActive` rehidrata nodes no mount
- [ ] `createTerminal` gera id único e adiciona node ao estado
- [ ] `createTerminal` persiste via `terminalRepository.persist`
- [ ] `createTerminal` define `title` automático quando `name` está vazio
- [ ] `createTerminal` usa `position` quando fornecido, senão posicionamento em cascata
- [ ] `createTerminal` deriva `folderName` corretamente (último segmento)
- [ ] **StrictMode safety:** double-invoke não gera 2 ids nem 2 persistências
- [ ] `moveNode` atualiza estado em memória SEM persistir
- [ ] `updateNode` atualiza estado E persiste no DB
- [ ] `removeNode` mata o pty, remove do DB e remove do estado

## 15. Renderer — `features/terminals/hooks/useTerminalSession.ts`

- [ ] Cria instância `Terminal` com fontSize/fontFamily/theme do `style`
- [ ] Carrega `FitAddon` e chama `fit()`
- [ ] Gera `ptyId` único por mount via `crypto.randomUUID()` (NÃO reusa `node.id`)
- [ ] Chama `window.ptyApi.create` com cols/rows do xterm e cwd/command do node
- [ ] Em shell `'default'`, envia `shell: undefined` (não a string `'default'`)
- [ ] Foca terminal após pty criado (a menos que disposed)
- [ ] `term.onData` repassa input via `window.ptyApi.input(ptyId, …)`
- [ ] `onData` do pty filtra por `ptyId` (não escreve dados de outros ptys)
- [ ] `onExit` escreve `[process exited]` em vermelho
- [ ] `ResizeObserver` chama `fit.fit()` e `window.ptyApi.resize` ao redimensionar
- [ ] **StrictMode safety:** cleanup do primeiro mount não polui o segundo (sem `[process exited]` no remount)
- [ ] Cleanup chama `kill(ptyId)`, dispose do terminal e disconnect do observer
- [ ] Mudança de `style.theme/fontFamily/fontSize` atualiza `term.options` SEM recriar pty

## 16. Renderer — `features/terminals/hooks/useTerminalStyles.ts`

- [ ] `getStyle` retorna `DEFAULT_TERMINAL_STYLE` quando id ausente
- [ ] `getStyle` merge profundo de patch parcial sobre defaults
- [ ] `setStyle` aplica patch parcial preservando outras propriedades
- [ ] `removeStyle` deleta entrada e persiste em localStorage
- [ ] `removeStyle` em id ausente é no-op
- [ ] Estilos persistem entre re-renders (via `useLocalStorage`)

## 17. Renderer — `features/canvas/hooks/useEdges.ts`

- [ ] `edges` inicial é `[]`
- [ ] `list` rehidrata edges no mount
- [ ] `addEdge` ignora self-loops (source === target)
- [ ] `addEdge` dedupe na mesma direção
- [ ] `addEdge` dedupe na direção inversa (source/target trocados)
- [ ] `addEdge` persiste via `edgeRepository.persist`
- [ ] `removeEdge` persiste deleção e remove do estado

## 18. Renderer — `features/canvas/hooks/usePanZoom.ts`

- [ ] Estado inicial: `pan = {0,0}`, `zoom = 1`
- [ ] `startPan` registra estado de drag
- [ ] `onMouseMove` durante drag atualiza pan pelo delta
- [ ] `endPan` limpa drag state
- [ ] `onBackgroundMouseDown` ignora clique sobre `.terminal-node` (exceto Shift+Left)
- [ ] `onBackgroundMouseDown` com Shift+Left inicia pan mesmo sobre node
- [ ] `onWheel` sobre `.terminal-node` é no-op (deixa xterm scrollar)
- [ ] `onWheel` sem Shift faz pan com deltaX/deltaY
- [ ] `onWheel` com Shift faz zoom de ±3% por notch ancorado no cursor
- [ ] Zoom clamp em `[0.25, 2.5]`
- [ ] `deltaY === 0` em wheel zoom é no-op

## 19. Renderer — `features/canvas/components/Canvas.tsx`

### Cálculos puros
- [ ] `edgePaths` produz path Bezier corretamente para nodes lado a lado
- [ ] `edgePaths` espelha origem/destino quando target está à esquerda da source
- [ ] `edgePaths` filtra edges onde source ou target não existem mais
- [ ] `edgePaths` marca `highlighted` quando endpoint selecionado
- [ ] `edgePaths` marca `edgeSelected` quando edge selecionada
- [ ] `surface` cresce com nodes e viewport (mínimo 4000px margem)
- [ ] `fitAll` é no-op com 0 nodes
- [ ] `fitAll` calcula bounds + padding + scale corretos

### Marquee
- [ ] Marquee inicia após threshold de 4px arrastando background com tool='select'
- [ ] Marquee converte client → world coords corretamente
- [ ] Marquee finaliza com `onSelectMany` contendo nodes interceptados
- [ ] Clique simples (sem mover) deseleciona tudo

### Tool modes
- [ ] Tool `pan` inicia pan imediato no mousedown
- [ ] Tool `link` mostra overlay correto e captura cliques em nodes
- [ ] Tool `delete` mostra overlay e remove node ao clicar
- [ ] Shift+Left click no background inicia pan independente da tool

### Right-click
- [ ] Right-click sem drag abre context menu com world coords
- [ ] Right-click com drag (>4px) faz pan e SUPRIME context menu
- [ ] Right-click sobre `.terminal-node` é ignorado

### Group drag
- [ ] `handleNodeDragStart` captura starts de todos os selecionados quando lead está no set
- [ ] `handleNodeMove` aplica delta do lead aos demais selecionados
- [ ] `handleNodeUpdate` persiste posição final de todos os arrastados
- [ ] Drag de node não selecionado NÃO afeta outros

### Focus / zoom controls
- [ ] `focusRequest` centraliza node e clamp zoom a `[0.7, 1.1]`
- [ ] `focusRequest` chama `onFocusConsumed`
- [ ] `zoomBy` é ancorado no centro da viewport
- [ ] `zoomTo(1)` reseta para 100%
- [ ] Zoom respeita clamp `[0.25, 2]` nos botões

## 20. Renderer — `features/canvas/components/Minimap.tsx`

- [ ] Renderiza retângulos proporcionais aos nodes
- [ ] Destaca nodes selecionados visualmente
- [ ] Mostra retângulo da viewport
- [ ] Clique/drag no minimap atualiza pan
- [ ] Botão close esconde o minimap
- [ ] Botão `IMap` re-exibe o minimap

## 21. Renderer — `features/terminals/components/TerminalNode.tsx`

- [ ] Renderiza title, cwd e botão close
- [ ] Double-click no title entra em modo edição
- [ ] Enter no edit commits via `onUpdateNode({ title })`
- [ ] Escape no edit descarta mudanças
- [ ] Edit em branco fallback para title original
- [ ] Drag dispara `onDragStart`, `onMoveNode` (durante) e `onUpdateNode` (no fim)
- [ ] Resize dispara `onMoveNode` durante e `onUpdateNode` no fim com nova posição+tamanho
- [ ] Min size 280x180 respeitado
- [ ] Tool `delete` no mousedown chama `onRemoveNode`
- [ ] Tool `link` no mousedown chama `onSelect` (sem drag)
- [ ] Shift+click chama `onSelect(id, true)` (additive)
- [ ] Context menu chama `onContextMenu` com client coords
- [ ] Botão close chama `onRemoveNode` (stopPropagation)
- [ ] `linkSource === id` adiciona outline/classe `is-link-source`
- [ ] `selected` aplica `is-selected` e zIndex elevado
- [ ] `raised` aplica zIndex topo (50)
- [ ] `scale={zoom}` propagado para Rnd

## 22. Renderer — `features/terminals/components/NewTerminalModal.tsx`

- [ ] Campos folder/command/name renderizados
- [ ] Botão "Select folder" chama `window.dialogApi.selectFolder` e popula input
- [ ] Confirm desabilitado quando folder vazio
- [ ] Confirm chama `onConfirm(folder, command, name)` com valores atuais
- [ ] Cancel chama `onCancel`
- [ ] Escape fecha modal
- [ ] Seleção de command atualiza select corretamente (codex/claude)

## 23. Renderer — `features/terminals/components/TerminalContextMenu.tsx`

- [ ] Renderiza nas coordenadas fornecidas
- [ ] Click outside (`onMouseDown` no overlay) fecha menu
- [ ] Click em "Link" chama `onLink` e fecha
- [ ] Click em "Style" chama `onStyle` e fecha
- [ ] Click em "Delete" chama `onDelete` e fecha
- [ ] Right-click fora também fecha

## 24. Renderer — `features/terminals/components/TerminalStyleModal.tsx`

- [ ] Renderiza com valores atuais do estilo
- [ ] Mudança de tema chama `onChange({ theme })`
- [ ] Mudança de fontSize chama `onChange({ fontSize })`
- [ ] Mudança de fontFamily chama `onChange({ fontFamily })`
- [ ] Botão "Reset" chama `onReset`
- [ ] Close chama `onClose`

## 25. Renderer — `app/components/Sidebar.tsx`

- [ ] Lista terminais filtrados por `query` (case-insensitive em title/cwd)
- [ ] Click em item chama `onSelect(id)` e `onFocus(id)`
- [ ] Highlight no `selectedId`
- [ ] Botão "New terminal" chama `onNewTerminal`
- [ ] Toggle theme chama `onToggleTheme` com valor oposto
- [ ] Collapse/expand alterna via `onCollapsedChange`
- [ ] Botão "Link" em item chama `onStartLink(id)`
- [ ] Estado `collapsed` esconde labels mas mantém ícones acessíveis

## 26. Renderer — `app/components/Topbar.tsx`

- [ ] Mostra contagem correta de terminais
- [ ] Select de shell propaga `onShellChange`
- [ ] Toggle theme chama `onToggleTheme`
- [ ] Aria-labels acessíveis

## 27. Renderer — `app/App.tsx` (composição)

### Keyboard
- [ ] Ctrl/Cmd+N abre modal
- [ ] Escape em tool `link`/`delete` volta para `select` e limpa `linkSource`
- [ ] Delete remove edge selecionada (e prioriza edge sobre nodes)
- [ ] Delete remove todos os nodes selecionados (multi-select) e seus estilos
- [ ] Delete em INPUT/TEXTAREA/contentEditable é ignorado

### Tools / Links
- [ ] `startLinkFrom(id)` ativa tool `link` com `linkSource = id`
- [ ] `handleLinkPick` com `linkSource = null` define source
- [ ] `handleLinkPick` com source válido adiciona edge e volta para `select`
- [ ] `handleLinkPick` com same id NÃO cria self-loop e ainda reseta tool

### Selection
- [ ] `selectNode(null)` limpa seleção
- [ ] `selectNode(id, false)` substitui seleção
- [ ] `selectNode(id, true)` faz toggle aditivo
- [ ] `selectEdge(id)` limpa node selection

### Context menus
- [ ] Node context menu armazena nodeId + coords
- [ ] Canvas context menu armazena world + client coords
- [ ] "New terminal here" usa `pendingCreatePos`

### Theme
- [ ] Toggle persiste tema em localStorage
- [ ] `<html>.dark` é aplicado/removido conforme tema

### Modais
- [ ] NewTerminalModal cancel reseta `pendingCreatePos`
- [ ] Style editor só abre quando node ainda existe

## 28. CLI bundle (`cli.cjs` injetado pelo IAO)

> Testes em runtime Node puro com mock do `http`.

- [ ] `iao help` (sem args ou `-h`/`--help`) imprime help e exit 0
- [ ] `iao agents` chama `GET /agents` e formata título + comando
- [ ] `iao agents` imprime mensagem "(no linked agents…)" para lista vazia
- [ ] `iao send` exige 2 args (`target` e `prompt`), senão exit 1
- [ ] `iao send` concatena prompt com múltiplas palavras
- [ ] `iao send` imprime confirmação com title resolvido
- [ ] `iao inspect` exige `target`
- [ ] `iao inspect` imprime output ou fallback "(no output captured yet…)"
- [ ] `iao debug` imprime self, port, paths e env
- [ ] Sem `IAO_PORT`/`IAO_TOKEN` exit 2 com mensagem
- [ ] Comando desconhecido exit 1 com mensagem
- [ ] Erros HTTP propagam body.error ou `http <status>`

## 29. SKILL.md (template `resources/skills/iao/SKILL.md`)

- [ ] Arquivo existe no path esperado
- [ ] Linkagem coerente: arquivos copiados por `ensureIAOSkill` casam com source
- [ ] (Smoke) Documenta os 4 comandos principais (`agents`, `send`, `inspect`, `debug`)

## 30. Componentes UI reutilizáveis (`components/ui/`)

- [ ] `Button` propaga `onClick`, respeita `disabled`, expõe `aria-label`
- [ ] `Modal` fecha em Escape e click no backdrop
- [ ] `Modal` faz focus-trap (Tab cicla dentro do modal)
- [ ] `Select` muda valor via teclado e mouse
- [ ] `Icon` renderiza SVG inline com `size` passado
- [ ] Todos os ícones (`IClose`, `ITrash`, `ILink`, etc.) renderizam sem erro

## 31. Acessibilidade

- [ ] Botões com `title` também têm `aria-label`
- [ ] Modais têm `role="dialog"` e `aria-modal="true"`
- [ ] Foco inicial em modal aterrissa no primeiro field interativo
- [ ] Atalhos de teclado documentados não conflitam com inputs ativos

## 32. Testes de integração / fluxo end-to-end (com mocks)

> Testes que exercitam múltiplos hooks/componentes juntos. Continuam mockando
> `node-pty`/SQLite no boundary.

- [ ] **Criar terminal:** click "New", confirma modal, novo node aparece no canvas, pty é criado, DB persistido
- [ ] **Drag-and-drop:** node move (sem persistir durante), persiste no drop
- [ ] **Resize:** node redimensiona, pty.resize é chamado, DB persiste no resize end
- [ ] **Multi-select drag:** marquee seleciona 3 nodes, arrastar um move os 3
- [ ] **Rename inline:** double-click no title, digita, Enter persiste
- [ ] **Link two terminals:** tool link → click A → click B → edge aparece e persiste
- [ ] **Delete edge:** seleciona edge, Delete remove e persiste
- [ ] **Delete node cascateia edges:** removeNode → edges órfãs somem do estado
- [ ] **Reload:** mount inicial chama listActive + edgesList, popula canvas
- [ ] **Theme persiste:** toggle → reload → tema restaurado
- [ ] **Sidebar collapse persiste:** reload → estado restaurado
- [ ] **Terminal styles persistem:** mudança via modal → reload → aplicado
- [ ] **IAO send fluxo:** terminal A com edge para B → `POST /send` no servidor IAO → `writeToPty` foi chamado no pty de B com prompt + `\r`
- [ ] **IAO inspect fluxo:** `appendOutput` em B → `GET /inspect` retorna output limpo de ANSI

## 33. Regressões já conhecidas (proteção)

- [ ] StrictMode double-mount NÃO imprime `[process exited]` no terminal remontado
- [ ] StrictMode double-mount NÃO cria 2 rows no DB para 1 terminal
- [ ] `pty:exit` de pty antigo NÃO escreve no terminal novo (filtro por `ptyId`)
- [ ] `iao send` envia `\r` em tick separado (não no mesmo write do prompt)
- [ ] Cascade FK remove edges quando terminal deletado pelo DB
- [ ] `removeStyle` é chamado junto com `removeNode` (evita vazamento em localStorage)

---

## Convenções

- **Co-localização:** `<unit>.test.ts(x)` ao lado do código.
- **Mocks no boundary:** `vi.mock('node-pty')`, `vi.mock('better-sqlite3')`, `vi.mock('electron')`, `vi.stubGlobal('window.ptyApi', …)`.
- **Sem pty real, sem DB real, sem rede real** (use `supertest` ou chamadas diretas ao handler para o servidor IAO).
- **Determinismo:** zere timers com `vi.useFakeTimers()` quando testar o delay 250ms / 50ms.
- **Regressão = teste:** todo bug fix entra com teste que falha antes do fix.
- **Verificação:** `npm test && npm run build` ambos verdes antes de qualquer merge.

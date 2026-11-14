# Os 12 princípios da animação no bamoonimation

Os 12 princípios da Disney (Thomas & Johnston) **já estão no motor**: boa parte é aplicada automaticamente
em toda cena, o resto vem de ferramentas de uma linha. Este guia diz, para cada princípio, **o que o motor
faz sozinho**, **o que você escreve** e **como conferir**. A regra de ouro continua: cada movimento precisa de
uma causa — o motor dá peso, inércia e acabamento, mas a intenção (o quê, quando, por quê) é sua.

Prancha de referência com cada princípio isolado: [`scenes/testes/principios.js`](../scenes/testes/principios.js).

```bash
bamoo sheet scenes/testes/principios.js                 # 12 momentos
bamoo still cena.js -t 2 --arcos                        # trilhas ±0.6 s de mãos, pés e cabeça (arcos e espaçamento)
bamoo still cena.js -t 2 --silhueta                     # teste de staging: a ação em preto chapado
bamoo check cena.js                                     # também mede slow in/out, twinning, holds congelados, staging
```

## Resumo: automático × ferramenta

| princípio | automático (sem escrever nada) | ferramenta |
|---|---|---|
| 1 squash & stretch | quica()/pulo() já deformam; sombras de contato acompanham a altura | `squash: k` em qualquer nó, `quica()`, `pulo()` |
| 2 antecipação | em **todo rig**: poses e alvos IK escritos com `kf` recuam antes de arrancar | `acao(kf, { antecipa })`, `pulo()` (agacha antes) |
| 3 staging | vinheta centrada nos personagens do plano focal; profundidade de campo; névoa | `--silhueta`, `check` (cortado/pequeno), `camera.focus` |
| 4 pose a pose / direto | `kf` liga as poses com intervalos suaves (tangentes automáticas) | `kf` (pose a pose), `dyn`/`particles`/`noise` (direto) |
| 5 follow-through / overlap | rigs: cada nível da hierarquia segue o pai com atraso, extremidades passam do alvo e assentam; cabelo, brinco e cauda de ave com mola | `mola:` em grupos, `segue()`, `atraso()` |
| 6 slow in / slow out | `kf` sem easing: repousa nas chaves extremas, passa direto pelas intermediárias | easings explícitos (`'inOut'`, `'out'`, `'sine'`…) |
| 7 arcos | mãos da `pessoa()` giram em arco em torno do ombro; `kf` de pontos com 3+ chaves curva sozinho | `kf(...).arco(0.2)`, `acao(kf, { polar })`, `spline()` |
| 8 ação secundária | pessoa: respiração, peso que oscila, cabeça que acompanha a fala, sobrancelhas, piscar ao virar a cabeça; ave: corpo sobe a cada batida; câmera viva | `mola:`, `osc`, `wig`, `particles` |
| 9 timing | antecipação/overshoot escalam com a rapidez de cada trecho | durações das chaves; `look.steps` (animar "em dois") |
| 10 exagero | — | `scene({ exagero: 1.4 })`, `acao(..., { exagero })`, `rig({ acao: { exagero } })` |
| 11 solid drawing | esqueletos com limites; squash de volume constante; sombras de contato sob pés/patas | `sombra()` para objetos, `check` |
| 12 appeal | anti-"twinning" (lado de lá defasado), moving holds, linhas de ação nas trajetórias | `check` acusa twinning; variar ritmo e silhuetas |

## 1 · Squash & stretch (achatar e esticar)

O peso e a elasticidade aparecem na deformação: **estica na direção da velocidade, achata no impacto**, sempre
com **volume constante** (sx·sy = 1).

- `squash: k` em qualquer nó (grupo, forma, rig): o motor mede a velocidade e a aceleração do ponto-base do nó
  no espaço da cena (reavaliando os ancestrais em t ± 0.05 s) e deforma. `k`: 0.3 sutil, 1 cartum, 2 elástico.
  Opções: `{ k, base: [x, y] (ponto que fica fixo — a base no chão), tam (tamanho de referência), janela }`.
- `quica({ x0, vx, chao, altura, t0, queda, perda })` → objeto que quica (parábolas, cada quique mais curto) com
  squash pronto. Desenhe com a **base em (0, 0)**.
- `pulo({ de, ate, altura, t0, dur })` → pulo com agachar (antecipação), esticar na saída, arco, achatar no pouso
  e amortecer.
- Objetos rígidos (foguete, carro, prédio) **não** fazem squash; personagens realistas, só sutil (k ≤ 0.4) e
  de preferência no corpo, não nas pernas (ex.: `G({ squash: { k: 0.45, base, tam } }, [corpo])` dentro da pele).

## 2 · Antecipação

Antes de uma ação, um pequeno movimento contrário prepara o olho (e a física): agachar antes de pular, recuar
o braço antes de lançar, a cabeça baixa antes de virar.

- **Automático nos rigs** (pessoa, ave, animais): todo canal de pose ou alvo IK escrito com `kf` ganha um recuo
  no começo de cada trecho que parte do repouso. O recuo é proporcional ao movimento e à **rapidez**: ação
  rápida (≤ 0.3 s) recebe tudo, movimento lento (≥ 1.5 s) quase nada. Pés/patas de apoio nunca são alterados.
- Em qualquer outro valor: `x: acao(kf([1, 100], [1.4, 600]), { antecipa: 0.15 })`.
- Ajuste por rig: `rig({ acao: { antecipa: 0.2 } })`, `pessoa({ acao: { antecipa: 0.2 } })`; desligue com `acao: false`.
- Ação grande pede preparação maior e mais longa: deixe tempo de "hold" antes (o recuo acontece dentro do trecho).

## 3 · Staging (encenação)

Um assunto por vez, claro e legível.

- **Automático:** o centro da vinheta é puxado para os personagens (rigs) do plano focal (`look.vignetteFoco`,
  0.4; 0 desliga); profundidade de campo e névoa separam fundo, ação e primeiro plano.
- **Teste da silhueta:** `bamoo still cena.js -t 2 --silhueta` desenha o plano focal em preto chapado. A pose tem
  que se ler só pelo contorno: braços destacados do corpo, perfil claro, nada importante escondido atrás de outro.
- `bamoo check` avisa quando o personagem do plano focal fica cortado pela borda por mais de 1 s ou quando o
  maior personagem do plano ocupa < 7% da altura do quadro.
- Composição: deixe respiro na direção do olhar/movimento, emoldure com o primeiro plano, mova a câmera para
  acompanhar a ação (não o contrário).

## 4 · Pose a pose × direto

- **Pose a pose** = `kf`: escreva as poses-chave (os "extremos") e deixe o motor fazer os intervalos. Com as
  **tangentes automáticas** (kf sem easing), o intervalo repousa nos extremos e passa liso pelas chaves de
  passagem — sem a "parada robótica" a cada chave. Easing explícito (`'out'`, `'back'`…) mantém o controle manual.
- **Direto** = procedimental: `dyn(t => ...)`, `particles`, `noise`/`wig`, `gait`, `wave` — fogo, água, fumaça,
  multidões, natação. Combine: o personagem por poses, o mundo direto.

## 5 · Follow-through e overlapping action

Nada para de uma vez: as partes chegam em tempos diferentes e passam do ponto.

- **Automático nos rigs:** quebra sucessiva das juntas — cada nível da hierarquia segue o pai com
  `acao.atraso` (0.03 s): quadril → tronco → ombro → cotovelo → mão. Na chegada, o trecho passa do alvo
  (`acao.passa`, 0.1, maior nas extremidades) e assenta. Funções de t (`t => ...`) recebem só o atraso.
- **Molas (partes soltas):** `G({ mola: true | { freq, amort, ganho, max, pendulo }, px, py }, [...])` — o grupo
  gira em torno do pivô (px, py) como massa-mola, reagindo à aceleração do pivô e aos giros dos ancestrais
  (inclusive ossos de rigs). Use em: orelhas, cabelo, rabo, antena, brinco, alça, lustre, planta carregada.
  `freq` (Hz) = rigidez, `amort` 0.1 balança muito / 0.8 quase nada, `pendulo` 0..1 = quanto pende pela gravidade
  quando o pai inclina. Já ligado em: cabelo `ondulado/longo/coque` e brinco da `pessoa()`, cauda da `ave()`.
- `segue(valor, { freq, amort })`: qualquer valor perseguindo outro como mola (câmera que segue o herói, objeto
  arrastado). `atraso(valor, s)`: o mesmo valor, alguns quadros depois.

## 6 · Slow in e slow out

- **Automático:** `kf` sem easing usa tangentes automáticas (como o "auto clamped" dos programas de animação):
  desacelera ao chegar e acelera ao sair das chaves de repouso (primeira, última, extremos, holds) e é contínuo
  nas chaves de passagem. 2 chaves = o mesmo `inOut` de antes.
- Evite `'linear'` em começos e finais visíveis (só para movimentos que já vêm embalados, como entrar na toca).
- `bamoo check` acusa "começo/parada brusca": uma extremidade que sai do repouso direto para a velocidade de
  cruzeiro (ou para de golpe). `--arcos` mostra o espaçamento: pontos juntos = devagar, separados = rápido.

## 7 · Arcos

Movimentos naturais giram em torno de juntas: descrevem arcos, não retas.

- **Automático:** os alvos de mão da `pessoa()` (kf) são interpolados em **coordenadas polares em torno do
  ombro**; `kf` de pontos com 3+ chaves já passa por uma curva suave.
- `kf([0, [100, 800]], [1, [900, 800]]).arco(0.25)`: o trecho vira um arco (25% da distância; negativo = outro lado).
- `acao(kf, { polar: [cx, cy] })`: interpola em arco em torno de qualquer centro. `spline()` para trajetórias livres.
- Confira com `--arcos`: a trilha deve ser uma curva limpa, sem bicos.

## 8 · Ação secundária

Movimentos que reforçam a ação principal sem roubar a cena.

- **Automático na `pessoa()`** (`vida: 1`; 0 desliga, 2 dobra): respiração (~14/min), peso que oscila quando
  parada, cabeça que acompanha a fala (`rosto.fala`), sobrancelhas nos acentos, **piscar ao virar a cabeça**,
  cotovelo que dobra no balanço da caminhada, cabeça que compensa o passo.
- **Automático na `ave()`**: o corpo sobe a cada descida da asa; cauda com mola.
- **Automático nos rigs**: "moving hold" (`acao.vida`, 1°) nos ossos do meio — ninguém fica congelado.
- **Câmera viva**: deriva lentíssima (±3 px, ±0.07°). `camera: { vida: 0 }` desliga, `2` dobra.
- Suas ferramentas: `mola`, `osc`, `wig`, `particles` (poeira no pouso, vapor, folhas), `blink`, `talk`.

## 9 · Timing

O número de quadros diz o peso e a intenção. Referências a 24–30 fps:

| ação | duração |
|---|---|
| piscar | 0.15–0.2 s |
| virar a cabeça | 0.3–0.6 s |
| gesto de mão | 0.4–0.8 s (+ 0.2 s de hold no extremo) |
| pegar um objeto | 0.6–1.0 s |
| passo de caminhada | 0.5–0.6 s por passo |
| pulo (no ar) | 0.4–0.8 s |
| hold para o espectador ler uma pose | ≥ 0.4 s |

- Contraste é tudo: ação rápida depois de preparação lenta; pausas antes das falas.
- O motor escala antecipação e overshoot pela rapidez de cada trecho; `look.steps: 12` anima "em dois"
  (estilo stop-motion/2D clássico) mantendo a câmera suave.

## 10 · Exagero

- `scene({ exagero: 1.4 })` (ou `film([...], { exagero })`) multiplica antecipação, overshoot, squash e molas da
  cena inteira; por personagem: `rig/pessoa({ acao: { exagero: 1.5 } })`; por valor: `acao(kf, { exagero })`.
- Exagere a **pose** e o **timing**, não a anatomia: o esqueleto continua dentro dos limites (o motor trava em
  silêncio o que a atuação acrescenta; o verificador só acusa o que você escreveu).

## 11 · Solid drawing (desenho sólido)

- Esqueletos com proporções reais e limites (`skeleton`, `pessoa`, `ave`) — ver [ANATOMIA.md](ANATOMIA.md).
- Squash de **volume constante**.
- **Sombras de contato automáticas** sob pés/patas de rigs com `ground` (somem quando o pé sobe; `sombra: false`
  desliga, `sombra: { a, c }` ajusta). Para móveis e objetos: `sombra(x, chao, largura, { a })` — também aceita
  funções de t (a sombra de um objeto que sobe encolhe e clareia).
- Uma luz coerente (`look.luz`), sombras próprias em meia-lua e névoa por profundidade já vêm do estilo.
- **Peça única automática:** cada personagem (rig) é iluminado como um volume só — oclusão entre as peças, sombra
  de forma e realce de borda pela silhueta inteira (ver "Peça única" em [ANATOMIA.md](ANATOMIA.md)).

## 12 · Appeal (apelo)

- **Expressões prontas** na `pessoa()`: `rosto: { expressao: 'feliz' }` ou linha do tempo — a troca já vem
  escalonada (sobrancelhas antes, boca depois) e a cabeça acompanha.

- **Anti-twinning automático:** o lado de lá (F) segue o de cá com `acao.desfase` (35 ms). Ainda assim varie as
  poses: braços em alturas diferentes, um gesto liderando o outro. O `check` acusa twinning.
- Silhuetas claras (`--silhueta`), assimetria, linhas de ação curvas (o tronco inclinado acompanhando o gesto),
  ritmo variado (nem tudo na mesma velocidade), personagens que respiram e piscam.

## Nada de pisca-pisca

Cada quadro é calculado do zero (é isso que permite render paralelo em qualquer FPS). Então um sorteio dentro de
uma função de t — `alpha: t => r()`, `x: t => r.range(...) + ...`, `Math.random()` — dá um valor novo a cada
quadro e a forma pisca ou pula. Sorteie **uma vez** na montagem e use o valor dentro da função; para variar no tempo
use `noise`, `wig`, `osc`. O `bamoo check` acusa cena não determinística (e mostra a região). O `render` também
confere cada quadro contra os vizinhos e redesenha o raro quadro em que uma camada inteira some (e avisa se a cena
não for determinística).

## Ligar, desligar, ajustar

| onde | opção | padrão |
|---|---|---|
| `rig({ acao })` / `pessoa({ acao })` | `{ antecipa, passa, atraso, desfase, vida, exagero }` ou `false` | `{ 0.12, 0.1, 0.03 s, 0.035 s, 1°, 1 }` |
| `pessoa({ vida })` | respiração, peso, fala, piscar ao virar | `1` |
| `scene({ exagero })` / `film(..., { exagero })` | multiplicador global | `1` |
| `look.vignetteFoco` | quanto a vinheta segue os personagens | `0.4` |
| `camera.vida` | deriva da câmera | `1` |
| rig `sombra` | sombras de contato | ligadas se o rig tem `ground` |
| `kf([t, v, 'inOut'])` | easing explícito = sem tangente automática nem atuação naquele trecho | — |

Sincronizar contato (a mão pega o objeto exatamente em t): use `acao: { atraso: 0 }` no personagem ou faça o
objeto aparecer alguns centésimos depois (a mão chega com ~0.06 s de atraso e assenta).

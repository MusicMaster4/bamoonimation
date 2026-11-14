# AGENTS.md — guia rápido para agentes de IA

Você escreve **um arquivo `.js` por animação** que exporta `scene({...})` ou `film([...])`.
Tudo é função contínua do tempo, então renderiza em qualquer FPS. Coordenadas de design: **1920×1080**
(origem no canto superior esquerdo, y para baixo, ângulos em graus).

## Regras

1. **Sem texto na tela** (legendas, letreiros, placas, números) a menos que o pedido peça texto. Conte a
   história com imagem e movimento; o verificador acusa texto como erro.
2. **Pessoas e animais sempre com esqueleto** (`pessoa()` ou `rig({ bones: skeleton(...) })`). Nunca
   desenhe membros soltos sem limites articulares. Leia `docs/ANATOMIA.md` antes de animar personagens.
3. **Rode `bamoo check` até zerar os erros** antes do render final.
4. **Herde o ESTILO; as FORMAS são do que foi pedido.** O acabamento (luz, sombra, textura, papel, grão,
   névoa, cor) já vem automático do motor. Os desenhos de `scenes/` são exemplos de técnica: você **pode**
   reaproveitar partes (código, uma nadadeira, a mecânica de uma mandíbula) quando a anatomia do sujeito pedido
   realmente for parecida — mas **é obrigatório conferir** que o resultado não virou copy-paste:
   **Revisão de identidade (antes do render):**
   - Escreva os 4–6 traços que identificam o sujeito pedido (ex.: orca = cabeça arredondada, dorsal alta e reta,
     peitorais em remo, mancha branca atrás do olho, cauda horizontal, nado vertical).
   - Olhe um `still` e confira cada traço, um a um. Faltou algum? Corrija.
   - Liste o que veio de um exemplo e pergunte: "isso existe no sujeito pedido?" (orca não tem guelras,
     focinho cônico nem cauda vertical de tubarão). Se não existe, remova/refaça.
   - Teste da silhueta: alguém vendo só o contorno diria que é o sujeito pedido — e não o exemplo de onde
     você partiu? Se houver dúvida, ainda não está pronto.
   Uma orca não é um tubarão pintado de preto e branco. Detalhes: "Desenhando um sujeito novo" em `docs/ANATOMIA.md`.
5. **Os 12 princípios da animação já vêm do motor** (`docs/PRINCIPIOS.md`): `kf` faz slow in/out sozinho, rigs ganham
   antecipação, overshoot, quebra das juntas e moving hold, `pessoa()` respira/pisca/acompanha a fala, cabelo e
   cauda têm mola, pés ganham sombra de contato. **Não reimplemente isso** — escreva as poses-chave com `kf` **sem
   easing**, dê tempo (holds ≥ 0.3 s antes de ações rápidas) e use as ferramentas: `squash`, `mola`, `quica`, `pulo`,
   `acao`, `sombra`, `exagero`. Confira com `--arcos` (arcos e espaçamento) e `--silhueta` (staging).
   **Rosto e andar já vêm prontos:** use `rosto: { expressao: 'feliz' }` (20 expressões, ou uma linha do tempo
   `[[0,'neutro'],[2,'surpreso'],[3,'rindo']]` com troca suave) e `caminhada(M, { x, chao, jeito: 'alegre' })`
   (7 jeitos de andar) em vez de animar sobrancelha/boca/braços à mão.
6. **Nada de sorteio dentro de função de t** — `r()`, `r.range()` ou `Math.random()` dentro de `t => ...` sorteia
   um valor novo a cada quadro e a imagem pisca. Sorteie uma vez na montagem e use o valor dentro da função:
   `scatter(n, seed, r => { const ph = r(); return circle(x, y, 4, { alpha: t => 0.6 + 0.4 * Math.sin(t + ph) }) })`.
   Para variar no tempo use `noise`/`wig`/`hash`. O `check` acusa isso como erro.

## Fluxo (barato em tokens)

```bash
node bin/bamoo.js new cenas/minha.js                    # cria a partir do modelo
node bin/bamoo.js still cenas/minha.js -t 2.5 --grid    # quadro com grade de coordenadas
node bin/bamoo.js still cenas/minha.js -t 2.5 --rig     # esqueletos por cima (vermelho = problema)
node bin/bamoo.js still cenas/minha.js -t 2.5 --layers  # cada camada tingida + legenda de z
node bin/bamoo.js still cenas/minha.js -t 2.5 --arcos   # trilhas ±0.6 s de mãos/pés/cabeça (arcos, espaçamento)
node bin/bamoo.js still cenas/minha.js -t 2.5 --silhueta # staging: a ação em preto chapado tem que se ler
node bin/bamoo.js sheet cenas/minha.js [--from a --to b] # 12 momentos numa imagem
node bin/bamoo.js check cenas/minha.js                  # camadas, texto, anatomia, pés, saltos, princípios
node bin/bamoo.js render cenas/minha.js --fps 30        # vídeo em out/minha.mp4
```

Para iterar num personagem, exporte uma cena nomeada com várias poses lado a lado
(`export const poseTest = scene(...)`, ver `scenes/hawk.js`) e aponte um arquivo de 2 linhas para ela.

## Esqueleto de cena

```js
import { scene, film, layer, G, blob, circle, rect, taper, particles, rays, lin, rad, kf, osc, pessoa, caminhada } from 'bamoonimation';

const shot = scene({
  dur: 6, bg: lin(90, '#8fb8de', '#f3d3b0'),
  look: { luz: 'entardecer' },            // o resto do visual vem do estilo padrão (referências)
  camera: { x: kf([0, 900], [6, 1020]), zoom: kf([0, 1], [6, 1.08]) },
  layers: [ layer({ z: 6 }, [/* fundo */]), layer({ z: 1 }, [/* ação */]), layer({ z: 0.5 }, [/* 1º plano */]) ],
  fadeIn: 0.6,
});
export default film([shot /*, shot2 */], { trans: 'cross', d: 0.6 });
```
Camadas: liste do **fundo (z maior) para a frente (z menor)**.

## Personagens

```js
const CHAO = 980, M = { sexo: 'm', altura: 740, cabelo: 'curto', barba: 'curta', roupa: 'jaqueta' };
pessoa({ ...M, x: 400, y: CHAO - pessoa.quadril(M), ground: CHAO,
  ik: { maoN: [70, -110], angMaoN: -6 }, rosto: { fala: t => talk(t, 1, 3), sorriso: 0.5 }, segura: { N: xicara } });
const passos = caminhada(M, { x: kf([0, 0], [4, 1500, 'sine']), chao: CHAO });   // andar anatômico
pessoa({ ...M, x: t => ..., ground: CHAO, ...passos });
rig({ name: 'coelho', plan: 'quadrupede', bones: skeleton('quadrupede', { altura: 120, variante: 'coelho' }),
      pose: {...}, ik: [{ chain: ['femurN','tibiaN','metaN'], target: t => [x, y], endAng: 0 }], skin: [...] });
```
- `skeleton('humano'|'quadrupede'|'ave'|'peixe', {...})`: ossos com proporções reais e limites. Sufixo N = lado
  de cá, F = lado de lá (ordem de desenho automática F → meio → N).
- IK: `{ chain: [a, b(, c)], target, endAng }` — alvo = ponta do 2º osso; escolhe a dobra válida sozinho.
- Peles: `{ bone, node }` (desenhe na pose de descanso), `{ limb: [ossos], w }`, `{ spine: [ossos], top, bot }`, `{ draw: S => nó }`.
- `ground: y` no rig → o verificador checa pé afundando/deslizando **e o motor desenha a sombra de contato**.
- **Peça única (automático):** todo rig é pintado como UM corpo — cada pele recebe só sua cor/textura, as peças da
  frente projetam sombra nas de trás (braço no tronco, cabeça no pescoço) e a luz/sombra de forma é calculada pela
  silhueta inteira. Não pinte sombras em cada peça para "separar" partes; desenhe as peças **sobrepostas nas
  juntas** e na ordem certa (roupa de cima por cima do quadril); o mesmo pano vira uma silhueta só
  (`G({ merge: true })`). Formas repetidas (penas, escamas) mantêm o volume de cada uma. Ajuste:
  `look: { unido: { oclusao, forma, borda, banho, parte } }`, `rig({ unido: false })` ou pele `{ oclusao: false }`.
- **Expressões** (`pessoa`): `rosto: { expressao }` — `neutro feliz rindo triste chorando bravo furioso surpreso
  assustado nojo desconfiado pensativo timido apaixonado entediado sonolento confuso determinado convencido
  preocupado`; intensidade `[[t, 'nome', 0.5]]`; canais soltos (`sorriso`, `sobInt`, `abre`, `palpebra`...) somam
  por cima. A cabeça inclina com a expressão. Prancha: `scenes/testes/expressoes.js`.
- **Jeitos de andar** (`caminhada`): `normal alegre triste apressado cansado furtivo confiante` (prancha
  `scenes/testes/jeitos.js`): contato → descida → passagem → impulso; o calcanhar sobe antes do limite do tornozelo.
- Atuação automática (rigs/pessoa): `acao: { antecipa: 0.12, passa: 0.1, atraso: 0.03, desfase: 0.035, vida: 1, exagero: 1 }`
  ou `acao: false`. Pessoa: `vida: 1` (respiração, peso, fala, piscar ao virar; 0 desliga).

## Valores animáveis (qualquer prop, inclusive geometria)
- fixo `x: 300` · keyframes `kf([0, 100], [2, 500, 'out'])` (easing do trecho que chega; `.loop()`, `.delay()`, `.arco(k)`) · função `t => ...`
- **kf sem easing = 'auto'**: repousa (slow in/out) na 1ª/última chave, extremos e holds; passa liso pelas intermediárias.
- princípios: `acao(kf, { antecipa, passa, atraso, polar, exagero })` · `segue(v, { freq, amort })` (mola/lag) ·
  `atraso(v, s)` · `quica({...})` (quique + squash) · `pulo({ de, ate, altura, t0, dur })` (agacha, arco, pouso)
- helpers: `osc wig spline move heading tw prog cycle pulse decay spring blink talk gait gaitPhase noise rng`
- easings: linear in out inOut in2 out2 inOut2 sine expoIn expoOut expo back backIn backInOut elastic bounce step

## Nós
| fábrica | uso |
|---|---|
| `G(props, filhos)` | grupo. `clip: forma`, `merge: true` (une filhos numa silhueta sombreada) |
| `layer({ z }, filhos)` | profundidade (parallax, névoa, desfoque). `fixed: true` = sem câmera |
| `blob(pts)` | forma suave `[x,y]`/`[x,y,r]` (r=0 quina). Principal ferramenta |
| `poly rect circle ellipse path` | primitivas |
| `taper(pts, larguras)` | pincelada afinada (cabelo, cauda, capim, dobras) |
| `line(pts, {stroke, lw})` | traço |
| `bocaAberta({ cima, baixo })`, `fileiraDentes()` | boca aberta de animal com profundidade (nunca um polígono chapado entre as mandíbulas) |
| `rig({...})`, `pessoa({...})`, `ave({...})` | personagens com esqueleto (aves: asa anatômica projetada; poses `ASA.*`, batida `bater(t, freq)`) |
| `particles({...})`, `rays({...})` | fumaça, bolhas, poeira, chuva / feixes de luz |
| `sombra(x, chao, largura, { a })` | sombra de contato (móveis, objetos; aceita funções de t) |
| `dyn(t => nós)`, `custom((ctx,t) => ...)`, `img(arq)` | procedural / canvas / imagem |

Transformação: `x y rot s sx sy px py skx flip alpha show:[t0,t1]`. Movimento: `squash: k|{k, base}` (estica na velocidade,
achata no impacto) · `mola: true|{ freq, amort, ganho, max, pendulo }` (parte solta girando no pivô px,py com inércia:
orelha, rabo, cabelo, antena, lustre). Estilo: `fill stroke lw shade hl tex glow blur blend drop`
(`fill shade hl tex sun light shadow stroke lw` são herdados). Pinturas: `lin(ang, ...cores)`, `rad(c, ...cores)`, `['#a','#b']`.

## Estilo padrão, luz, câmera e look
**O estilo padrão já é o das referências** (`estilo: 'ilustrado'`): pincel seco automático em formas grandes,
"banho de luz" (lado do sol quente, lado oposto frio), sombra em meia-lua, papel e grão, névoa da cor do céu,
profundidade de campo, bloom, vinheta e grade de cor quente. **Não reconfigure isso** — escolha só a luz:
`look: { luz: 'dia' | 'entardecer' | 'amanhecer' | 'interior' | 'noite' | 'subaquatico' }` (traz céu padrão se
a cena não tiver `bg`). Outros acabamentos: `estilo: 'papel'` (impresso) ou `'limpo'` (vetor chapado, diagramas).
Ajustes finos sobrescrevem chaves do estilo: `sun, light, shadow, shade, hl, autoTex, autoLuz, haze, grain,
grainFps, paper, vignette, bloom, grade, dof, bars, steps, mblur` (tudo animável). `tex: false`/`luz: false` numa forma desliga o automático.
`camera: { x, y, zoom, rot, dolly, focus, dof, shake, vida }` (vida = deriva lenta automática; 0 desliga).
`scene({ exagero: 1.3 })` multiplica antecipação, overshoot, squash e molas. A vinheta segue os personagens do plano focal.

## Composição
3+ camadas (fundo enevoado, ação, 1º plano escuro desfocado) · uma luz coerente, sombras frias e luzes quentes ·
formas grandes com `blob`, detalhes com `taper` · textura sutil · nada parado · câmera sempre se movendo devagar ·
fundos maiores que a tela (+400 px). Detalhes: `README.md`, `docs/ANATOMIA.md`. As cenas em `scenes/` mostram
como usar a API — consulte-as para tirar dúvida de *sintaxe/técnica*, nunca como molde de desenho.

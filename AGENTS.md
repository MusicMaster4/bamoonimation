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

## Fluxo (barato em tokens)

```bash
node bin/bamoo.js new cenas/minha.js                    # cria a partir do modelo
node bin/bamoo.js still cenas/minha.js -t 2.5 --grid    # quadro com grade de coordenadas
node bin/bamoo.js still cenas/minha.js -t 2.5 --rig     # esqueletos por cima (vermelho = problema)
node bin/bamoo.js still cenas/minha.js -t 2.5 --layers  # cada camada tingida + legenda de z
node bin/bamoo.js sheet cenas/minha.js [--from a --to b] # 12 momentos numa imagem
node bin/bamoo.js check cenas/minha.js                  # camadas, texto, anatomia, pés, saltos
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
- `ground: y` no rig → o verificador checa pé afundando/deslizando.

## Valores animáveis (qualquer prop, inclusive geometria)
- fixo `x: 300` · keyframes `kf([0, 100], [2, 500, 'out'])` (easing do trecho que chega; `.loop()`, `.delay()`) · função `t => ...`
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
| `dyn(t => nós)`, `custom((ctx,t) => ...)`, `img(arq)` | procedural / canvas / imagem |

Transformação: `x y rot s sx sy px py skx flip alpha show:[t0,t1]`. Estilo: `fill stroke lw shade hl tex glow blur blend drop`
(`fill shade hl tex sun light shadow stroke lw` são herdados). Pinturas: `lin(ang, ...cores)`, `rad(c, ...cores)`, `['#a','#b']`.

## Estilo padrão, luz, câmera e look
**O estilo padrão já é o das referências** (`estilo: 'ilustrado'`): pincel seco automático em formas grandes,
"banho de luz" (lado do sol quente, lado oposto frio), sombra em meia-lua, papel e grão, névoa da cor do céu,
profundidade de campo, bloom, vinheta e grade de cor quente. **Não reconfigure isso** — escolha só a luz:
`look: { luz: 'dia' | 'entardecer' | 'amanhecer' | 'interior' | 'noite' | 'subaquatico' }` (traz céu padrão se
a cena não tiver `bg`). Outros acabamentos: `estilo: 'papel'` (impresso) ou `'limpo'` (vetor chapado, diagramas).
Ajustes finos sobrescrevem chaves do estilo: `sun, light, shadow, shade, hl, autoTex, autoLuz, haze, grain,
grainFps, paper, vignette, bloom, grade, dof, bars, steps, mblur` (tudo animável). `tex: false`/`luz: false` numa forma desliga o automático.
`camera: { x, y, zoom, rot, dolly, focus, dof, shake }`.

## Composição
3+ camadas (fundo enevoado, ação, 1º plano escuro desfocado) · uma luz coerente, sombras frias e luzes quentes ·
formas grandes com `blob`, detalhes com `taper` · textura sutil · nada parado · câmera sempre se movendo devagar ·
fundos maiores que a tela (+400 px). Detalhes: `README.md`, `docs/ANATOMIA.md`, cenas em `scenes/`.

# AGENTS.md — guia rápido para agentes de IA

Você escreve **um arquivo `.js` por animação** que exporta `scene({...})` ou `film([...])`.
Tudo é função contínua do tempo, então renderiza em qualquer FPS. Coordenadas de design: **1920×1080**
(origem no canto superior esquerdo, y para baixo, ângulos em graus).

## Fluxo (barato em tokens)

```bash
node bin/bamoo.js new cenas/minha.js            # cria a partir do modelo
node bin/bamoo.js sheet cenas/minha.js          # 1 imagem com 12 momentos (escala 0.25)
node bin/bamoo.js still cenas/minha.js -t 2.5 --grid   # quadro com grade de coordenadas
node bin/bamoo.js render cenas/minha.js --fps 30       # vídeo final em out/minha.mp4
```

1. Esboce composição e cores com `still --grid` (escala 0.5).
2. Anime e confira o tempo com `sheet` (use `--from/--to` para focar um trecho).
3. Só renderize vídeo no fim. Use `--scale 0.5` para prévias rápidas.
4. Para iterar num personagem isolado, exporte uma cena nomeada (`export const teste = scene(...)`) e
   aponte um arquivo de 2 linhas para ela (ver `scenes/hawk.js` → `poseTest`).

## Esqueleto

```js
import { scene, film, layer, G, blob, circle, rect, taper, limb, particles, rays, text, lin, rad, kf, osc } from 'bamoonimation';

const shot = scene({
  dur: 6, bg: lin(90, '#8fb8de', '#f3d3b0'),
  look: { sun: [-0.6, -0.8], shadow: '#3e3470', haze: { c: '#c9d6e3', a: 0.5 } },
  camera: { x: kf([0, 900], [6, 1020]), zoom: kf([0, 1], [6, 1.08]), dof: 6 },
  layers: [ layer({ z: 6 }, [/* fundo */]), layer({ z: 1 }, [/* ação */]), layer({ z: 0.5 }, [/* 1º plano */]) ],
  captions: [[0.5, 4, 'Legenda manuscrita.']], fadeIn: 0.6,
});
export default film([shot /*, shot2 */], { trans: 'cross', d: 0.6 });
```

## Valores animáveis (qualquer prop, inclusive geometria)
- fixo: `x: 300`
- keyframes: `x: kf([0, 100], [2, 500, 'out'], [3, 450, 'back'])` — easing vale para o trecho que **chega** na chave (padrão `inOut`). Interpola números, arrays de pontos, cores e objetos. `.loop()`, `.delay(s)`.
- função: `x: t => 100 + 50 * Math.sin(t)` (t = segundos da cena)
- helpers: `osc(freq, amp, fase, base)`, `wig(freq, amp, seed, base)`, `spline([t,[x,y]], ...)` + `move(pos, {orient})`, `tw(t, t0, t1, a, b, ease)`, `prog`, `cycle`, `pulse`, `decay`, `spring`, `blink(t, seed)`, `talk(t, t0, t1, seed)`, `gait(dist, {stride, lift})`, `noise`, `rng(seed)`.
- easings: linear in out inOut in2 out2 inOut2 sine expoIn expoOut expo back backIn backInOut elastic bounce step

## Nós
| fábrica | uso |
|---|---|
| `G(props, filhos)` | grupo/transformação. `filhos` pode ser `t => [...]`. `clip: forma`, `merge: true` (une filhos numa silhueta sombreada) |
| `layer({ z }, filhos)` | profundidade: z>1 fundo (parallax menor, névoa, desfoque), z<1 primeiro plano. `fixed: true` = sem câmera (títulos/HUD) |
| `blob(pts)` | forma suave pelos pontos `[x,y]` / `[x,y,r]` (r=0 quina viva). **Principal ferramenta de desenho** |
| `poly(pts, {r})`, `rect(x,y,w,h,{r})`, `circle(cx,cy,r)`, `ellipse(cx,cy,rx,ry)`, `path('M..')` | primitivas |
| `taper(pts, larguras)` | pincelada afinada: cabelo, caudas, galhos, capim, dobras. larguras: n \| [a,b,...] \| u=>w. `grow` 0..1 desenha |
| `line(pts, {stroke, lw, dash, grow})` | traço suave |
| `limb(a, b, [l1,l2], [w0,wJ,w1], {bend, end, endAbs})` | braço/perna com IK de 2 ossos; `end` = mão/pé |
| `text(str, {font, size, fill, align, reveal})` | fontes: `hand` `serif` `mono` `sans` `script` |
| `particles({...})` | fumaça, bolhas, poeira, chuva, faíscas (analítico, sem estado) |
| `rays({at, ang, spread, n, len, w, c, a})` | feixes de luz |
| `dyn(t => nós)` | geometria procedural por quadro (criaturas com espinha, IK manual) |
| `custom((ctx, t) => ...)` | escape para a API canvas |
| `img(arquivo, {w, h})` | imagem do disco |

Transformação (todos): `x y rot s sx sy px py skx flip alpha show:[t0,t1]`.
Estilo: `fill` (cor, `lin(ang, ...cores)`, `rad(c, ...cores)`, ou `['#a','#b']`), `stroke lw`,
`shade` (sombra própria, 0..1 ou `{a, d, dp, soft, c}`), `hl` (realce do lado da luz), `tex`
(`grain speckle brush paper hatch blot` ou `{k, a, s, rot}`), `glow` (`r` ou `{r, c, a}`), `blur`, `blend`, `drop`.
`fill shade hl tex sun light shadow stroke lw` são **herdados** de grupos/camadas.

## Geometria útil
`body(espinha, topo, baixo)` → contorno de criatura ao redor de uma espinha (cauda→cabeça, voltada p/ +x);
`wave(pts, t, {amp, freq, len, dir})` → ondulação (nadar, balançar); `along(pts, u)` → ponto+ângulo na curva;
`ik2(a, b, l1, l2, bend)`; `profile([...])(u)`; `xf`, `mirror`, `ellipsePts`, `polar`.

## Câmera e look
`camera: { x, y, zoom, rot, dolly, focus, dof, shake }` — `dolly` dá parallax de aproximação; `dof` = desfoque por profundidade.
`look: { sun, light, shadow, shade, hl, haze:{c,a}, grain, grainFps, vignette, vignetteC, bloom, grade:{sat,con,bri,tint,tintA,lift}, bars, steps, mblur, caption:{font,size,c,y} }` — `mblur` e qualquer item podem ser funções de t.

## Regras de ouro do estilo
1. **3+ camadas de profundidade** (fundo z≥4 enevoado, ação z=1, primeiro plano z≈0.5 escuro e desfocado).
2. **Luz única e coerente** (`look.sun`); sombras frias (roxo/azul), luzes quentes. Contraste quente/frio entre ambiente e personagem.
3. Formas grandes e simples com `blob`; detalhe com `taper` (cabelo, dobras, capim). Evite contornos pretos — use sombra própria.
4. Textura sutil em superfícies grandes (`tex: 'brush'|'speckle'|'blot'`), grão global já vem ligado.
5. Movimento orgânico: nada parado — `osc`/`wig` em plantas, respiração, piscadas; easings com antecipação (`back`) e assentamento.
6. Câmera sempre viva: pan/zoom lento; `shake` + `decay` em impactos; `mblur` só nos trechos rápidos.
7. Desenhe fundos **maiores que a tela** (margem ~400 px) por causa de pan/zoom/desfoque.
8. Para personagens: perfil é mais fácil e elegante; olhos com `blink`, boca com `talk`, braços/pernas com `limb`, pés com `gait`.

Mais detalhes, exemplos e boas práticas: `README.md` e as 4 cenas em `scenes/`.

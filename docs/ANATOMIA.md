# Anatomia: pessoas e animais corretos

Leia isto **antes** de animar qualquer personagem. O motor tem três peças que trabalham juntas:

1. **Esqueletos de referência** — `skeleton('humano' | 'quadrupede' | 'ave' | 'peixe', {...})`: ossos com
   proporções reais e **limites articulares** (o joelho não dobra para trás, o cotovelo não passa de ~150°).
2. **Rigs** — `rig({ bones, pose, ik, skin })`: o esqueleto animado. O IK escolhe sozinho a dobra válida,
   trava poses impossíveis e as peles (desenhos) acompanham os ossos.
3. **Verificador** — `bamoo check cena.js`: amostra o filme e acusa articulação fora do limite, membro
   esticado além do alcance, proporção errada, assimetria, pé afundando/deslizando, teletransporte,
   camadas fora de ordem e texto. `bamoo still cena.js -t 2 --rig` desenha os esqueletos (vermelho = problema).

E bases prontas: **`pessoa()`** (homem e mulher anatômicos) + **`caminhada()`** (andar realista), e
**`ave()`** (rapina ou pássaro, com asa anatômica projetada em 3D) + **`bater()`** / **`ASA`** (poses de voo).

---

## Desenhando um sujeito novo (não copie os exemplos)

O motor dá o **estilo** automaticamente; a **forma** é sempre do sujeito pedido. Os personagens dos
benchmarks (`scenes/`) existem para mostrar técnicas — nunca reaproveite a silhueta, os perfis de corpo,
as nadadeiras, a paleta ou a composição deles para outro animal.

Antes de escrever código para um animal/objeto novo:

1. **Liste 4–6 traços que o identificam de longe** (silhueta), em palavras. Ex. — **orca**: cabeça
   arredondada sem focinho pontudo; nadadeira dorsal enorme e reta (triangular alta no macho); nadadeiras
   peitorais grandes em forma de **remo arredondado**; padrão preto e branco nítido (mancha branca oval atrás
   do olho, ventre branco, "sela" cinza atrás da dorsal); cauda horizontal (golfinídeo: nada **ondulando para
   cima e para baixo**, não de lado); dentes cônicos iguais. **Tubarão**: focinho cônico, boca por baixo,
   guelras, cauda vertical assimétrica, nada de lado a lado. Se a lista dos dois sujeitos ficar parecida,
   pesquise mais até ela diferenciá-los.
2. **Proporções do sujeito real** (comprimento × altura, tamanho da cabeça, posição dos olhos e membros) —
   escreva os números antes dos pontos.
3. **Esqueleto e movimento do sujeito real**: escolha o plano (`humano`, `quadrupede` + variante, `ave`,
   `peixe`) ou monte ossos próprios; descreva como ele se move (ex.: mamífero marinho ondula na vertical,
   peixe na horizontal; felino pisa nos dedos; cavalo no casco).
4. **Paleta própria**, derivada do sujeito e do ambiente — não da cena de exemplo.
5. Desenhe numa **prancha de poses** (`export const poseTest`) e compare com a lista do passo 1 antes de
   animar. Se alguém olhando a silhueta preta confundiria com outro bicho, ainda não está bom.

Técnicas reaproveitáveis (essas sim): corpo ao redor de uma espinha com `body()`, ondulação com `wave()`,
peles presas a ossos, `bocaAberta()`, `ave()`, `pessoa()`, IK com limites.

## Convenções

- Personagens de **perfil, voltados para +x**. Para olhar para a esquerda: `flip: true`.
- y para baixo, ângulos em graus, **ângulo de cada osso é relativo ao osso pai**; positivo = horário na tela.
- Origem do rig = articulação do quadril (humanos/animais) ou a cabeça (peixe).
- Sufixo **N** = lado de cá (near), **F** = lado de lá (far): `coxaN`, `bracoF`. As peles são desenhadas
  automaticamente na ordem **F → meio → N** (o braço de lá nunca fica na frente do tronco).
- Alvos IK e poses estão em **coordenadas do rig**. Se o rig está girado/escalado e você quer um alvo no
  chão do mundo, converta: `local = R(-rot) · (mundo − posição) / s` (veja `toLocal` em `scenes/hawk.js`).

## Pessoas: use `pessoa()`

```js
import { pessoa, caminhada, kf } from 'bamoonimation';

const CHAO = 980;
const ELE = { sexo: 'm', altura: 740, cabecas: 6.5, cabelo: 'curto', barba: 'curta', oculos: true, roupa: 'jaqueta',
              cores: { cima: '#4d6088', baixo: '#33364a', sapato: '#4a2c24', detalhe: '#f1e9d8' } };
const ELA = { sexo: 'f', altura: 700, cabelo: 'ondulado', roupa: 'vestido', cores: { cima: '#2e8a83', baixo: '#2e8a83' } };

// em pé, parado
pessoa({ ...ELE, x: 400, y: CHAO - pessoa.quadril(ELE), ground: CHAO });

// sentada (quadril ~5% da altura acima do assento), pés no chão, mão no joelho, olhando para a esquerda
const ySit = ASSENTO - 0.052 * ELA.altura, tornozelo = CHAO - pessoa.sola(ELA) - ySit;
pessoa({ ...ELA, x: 900, y: ySit, flip: true, ground: CHAO,
  ik: { peN: [150, tornozelo], peF: [118, tornozelo], maoN: [120, -60], angMaoN: 20 } });

// andando (pé plantado, rolamento do pé, quadril em arco, braços em oposição)
const x = kf([0, 100], [4, 100 + 3.5 * (0.36 * 740) / 0.6, 'sine']);   // (n + 0.5) passos: para com os 2 pés no chão
const passos = caminhada(ELE, { x, chao: CHAO });
pessoa({ ...ELE, x: t => x.at(t), ground: CHAO, ...passos,
  ik: { ...passos.ik, maoN: [70, -110], angMaoN: -6 }, segura: { N: minhaXicara } });
```

Opções principais: `sexo`, `altura`, `cabecas` (7.5 realista · 6–6.5 ilustração · 4–5 cartum), `pele`,
`corCabelo`, `cabelo` (`curto | ondulado | coque | longo | careca`), `barba` (`curta | cheia`), `oculos`,
`roupa` (`jaqueta | camisa | vestido | blusa | calca`), `cores`, `rosto: { piscar, fala, sorriso, sobrancelha, olhar }`,
`pose: { osso: ângulo }`, `ik: { maoN, maoF, peN, peF, angMaoN, ... }` (alvo = **punho/tornozelo**),
`segura: { N, F }` (objeto na mão), `skin: [...]` (peles extras), `ground` (y do chão, para o verificador).
Helpers: `pessoa.quadril(o)` (quadril→chão em pé), `pessoa.sola(o)`, `pessoa.perna(o)`.

Peças reutilizáveis para montar variações: `cabecaPerfil(o)`, `olho(...)`, `boca(...)`.

### Medidas do corpo humano (já embutidas no esqueleto)

| referência | fração da altura |
|---|---|
| sola → tornozelo | 0.039 |
| joelho | 0.285 do chão |
| articulação do quadril | 0.53 do chão (≈ metade da altura) |
| C7 (base do pescoço) | 0.83 |
| queixo | 0.87 |
| braço (ombro→cotovelo) / antebraço / mão | 0.186 / 0.146 / 0.108 |
| coxa / canela / pé (tornozelo→dedos) | 0.245 / 0.246 / 0.12 |

Checagens rápidas no olho: **cotovelo na cintura, punho na virilha, ponta dos dedos no meio da coxa**,
coxa ≈ canela, mão cobre o rosto do queixo à linha do cabelo, o pescoço inclina um pouco para a frente.
Mulher (`sexo: 'f'`): mãos ~8% e pés ~10% menores, braço um pouco mais curto, pescoço mais longo e fino,
cintura mais estreita e quadril mais largo no desenho.

### Limites articulares (humano, relativos ao pai)

| osso | descanso | min…max | significado |
|---|---|---|---|
| tronco | −90 | −125…−40 | inclinar para trás 35° / para frente 50° |
| pescoco | 0 | −45…50 | olhar para cima / queixo no peito |
| cabeca | 0 | −35…35 | aceno |
| braco* | 180 | −15…245 | braço para cima (0) … para trás (245) |
| antebraco* | −10 | −150…5 | **cotovelo só dobra para a frente**, máx. ~150° |
| mao* | 0 | −80…80 | punho |
| coxa* | 90 | −40…125 | coxa para a frente (sentado = 0) / para trás |
| canela* | 0 | −5…155 | **joelho só dobra para trás** |
| pe* | −90 | −125…−40 | ponta para cima / para baixo |

Gestos que **não** cabem nesses limites (o verificador avisa): pulso colado no ombro, "mão no queixo" com o
cotovelo apoiado e o tronco reto (precisa > 150° de cotovelo), beber com o copo encostado no ombro. Solução:
afaste o alvo (cotovelo à frente), incline o tronco ou troque o gesto.

## Animais

### Quadrúpedes — `skeleton('quadrupede', { altura, variante: 'cao' | 'gato' | 'cavalo' | 'coelho' })`

`altura` = cernelha (topo do ombro). Ossos: `quadril, coluna, pescoco, cabeca, cauda1..n,
umero*, antebraco*, mao*` (dianteira) e `femur*, tibia*, meta*, pata*` (traseira).

- Dianteira: **cotovelo** dobra para − (pata vem para frente), **carpo** dobra para + (pata dobra para trás).
- Traseira: **joelho** (tíbia) dobra para +, **jarrete** (meta) para − — o "joelho para trás" é o calcanhar.
- Digitígrados (cão, gato) pisam nos dedos; cavalo na ponta (casco); coelho apoia o pé traseiro longo inteiro.
- Coelho: patas traseiras ≈ 2× as dianteiras; agachado, o pé traseiro fica deitado no chão sob o corpo.
- Salto do coelho (ver `salto()` em `scenes/hawk.js`): traseiras empurram (calcanhar sobe) → voo com as patas
  estendidas para trás → **dianteiras pousam primeiro, com o focinho inclinado para baixo** → traseiras passam
  para a frente e pousam → agacha. Dirija pela distância (como `gait`) e termine com um número inteiro de saltos.

### Aves — use `ave()` (base pronta) sobre `skeleton('ave', { tamanho })`

```js
import { ave, ASA, bater } from 'bamoonimation';
ave({ tipo: 'rapina', tamanho: 420, x, y, s: 0.8, asa: t => bater(t, 2), cauda: 0.5 });            // voando
ave({ tipo: 'passaro', x, y: CHAO - 165 * s, s, rot: -20, ground: CHAO, asa: ASA.dobrada,          // pousado
      coxa: 85, pe: [-30, 158], dedos: 20, cores: { corpo: '#8a6446' } });
ave({ ..., asa: ASA.freio, coxa: 10, pe: [125, 115], dedos: 40, garra: 1 });                         // ataque
```

**Por que a asa é especial:** o bater de asa acontece num plano **perpendicular à câmera**. Girar ossos no
plano da tela quebra a asa (vira um bastão e as penas trocam de lado). Em `ave()` a asa é modelada na sua
própria **planta** e projetada na tela:

- pose de asa = `{ e, f, v }`: **elevação** `e` (90 para cima · 0 apontando para a câmera, vira uma lâmina ·
  −90 para baixo), **dobra** `f` (0 aberta … 1 fechada em Z) e **varredura** `v` (+ = pontas para trás);
- a dobra segue a anatomia: úmero 0.18T, ulna 0.24T, mão 0.2T, cotovelo de 165° (aberto) a 25° (fechado),
  punho de 165° a 18° — úmero para trás, ulna para a frente, mão para trás;
- **secundárias** presas à ulna (borda de fuga, sempre para a cauda), **primárias** presas à mão (leque com
  "dedos" na ponta), terciárias perto do corpo, coberteiras por cima;
- poses prontas em `ASA`: `alta`, `meio`, `baixa`, `recolhe`, `planando`, `freio`, `dobrada` (no flanco);
- `bater(t, freq)`: desce **estendida** (força) e sobe **recolhendo o punho** (`recolhe`), como as aves reais.

Ossos do esqueleto: `quadril, corpo, pescoco, cabeca, cauda, ombro*` (fixação da asa) e
`coxa*, tibio*, tarso*, dedos*` (perna). Prancha de referência: `scenes/testes/aves.js`.
- A coxa (fêmur) fica escondida no corpo; o que se vê é o tibiotarso ("coxinha", com penas) e o tarso
  escamoso. O "joelho para trás" das aves é o **tornozelo**.
- Ataque de rapina: fêmur gira para a frente e lança as garras à frente do peito, asas para cima e para trás
  (freio), cauda em leque. Pousado: corpo ereto (~30–45°), fêmur para baixo, dedos na horizontal do mundo.

### Bocas abertas — `bocaAberta()` / `fileiraDentes()`

Nunca preencha o vão entre as mandíbulas com um polígono chapado fechado por uma reta entre as pontas
(vira uma "membrana de carne" sem profundidade). Use:

```js
bocaAberta({ cima: labioDeCima, baixo: labioDeBaixo })   // bordas dos lábios, do fundo (articulação) para a ponta
```

Ela desenha a abertura frontal **côncava**, a **garganta** escura no fundo, a **língua**, a gengiva e os
**dentes do lado de lá** (menores, mais escuros, recuados — é isso que dá profundidade) e a borda interna
dos lábios. Opções: `cores { garganta, boca, gengiva, lingua, dente }`, `profundidade`, `lingua`,
`ladoDeLa`, `dentes { n, tam, de, ate, forma: 'ponta' | 'serra' | 'canino', k }`. Para controlar a ordem de
desenho (ex.: dentes de baixo por cima da mandíbula), use `dentes: false` e `fileiraDentes(linha, oposta, {...})`.
A mandíbula de baixo gira em torno da articulação (técnica usada em `scenes/shark.js` — copie a técnica, não o tubarão).

### Peixes — `skeleton('peixe', { comprimento, segmentos })`

Cabeça (raiz) + segmentos para trás com ±25° por junta. Anime com uma onda na pose (`s1..sN`) ou use
a técnica `wave()` + `body()` (exemplo de uso em `scenes/shark.js` — os perfis de corpo devem ser os do seu animal). Pele de corpo: `{ spine: ['s6', ..., 's1', 'cabeca'], top, bot }`.

## Peles (desenhos presos ao esqueleto)

| pele | uso |
|---|---|
| `{ bone, node }` | desenho rígido (cabeça, mão, sapato, tronco). **Desenhe na pose de descanso, em coordenadas do rig** — ele acompanha o osso. `local: true` usa as coords do osso (origem na junta, +x ao longo do osso), bom para objetos segurados |
| `{ limb: [ossos], w: [larguras nas juntas], fill }` | membro contínuo e arredondado nas juntas |
| `{ spine: [ossos], top, bot, fill }` | contorno com perfis diferentes na frente/atrás (coxa+panturrilha, braço+bíceps). Liste da raiz para a ponta: em membros que descem, `top` = frente |
| `{ draw: S => nó }` | desenho procedural a partir das posições dos ossos (`S.get('coxaN')` → `{x0,y0,x1,y1,abs,rel}`): saias, roupas, asas projetadas (ver `pelesAsa` em `src/ave.js`) |
| `side: 'far' | 'mid' | 'near'`, `show`, `hidden`, `alpha` | ordem e visibilidade |

Para posicionar peles, rode `bamoo still cena.js -t 0 --rig --grid` com o rig em pose de descanso.

## Movimento sem patinar

- **Pessoas andando**: `caminhada()` (resolve pés, quadril e braços). Velocidade de caminhada ≈ 0.5–0.8 × altura/s;
  passo ≈ 0.36 × altura. Acelere/freie com `'sine'`/`'inOut'` — o pé de apoio continua plantado.
- **Qualquer bípede/quadrúpede**: dirija as patas pela **distância percorrida** (`gait(dist, ...)`), não pelo tempo.
- **Contato no chão**: alvos de pé no apoio = ponto fixo no mundo; no voo/balanço, use poses de ângulos válidos
  (converta por cinemática direta em alvos) para não estourar limites; evite trocar IK ↔ pose instantaneamente
  (interpole o alvo até a posição da pose recolhida).

## Checklist antes de renderizar

1. `bamoo check cena.js` → **zero erros** (avisos: entenda cada um).
2. `bamoo sheet cena.js --rig` nos trechos de ação: nenhum osso vermelho, nada atravessando o chão.
3. Silhueta legível no primeiro quadro de cada pose-chave (`still`).
4. Sem texto na tela, a menos que o pedido inclua texto (`--allow-text`).

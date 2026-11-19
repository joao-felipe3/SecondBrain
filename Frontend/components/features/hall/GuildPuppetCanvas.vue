<template>
  <!-- NPC animado em tempo real pelo player próprio (marionete de scripts/hall-life/rive_rig.py) -->
  <canvas ref="canvas" class="puppet-canvas" :class="{ 'is-ready': ready }" aria-hidden="true" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import {
  applyVars,
  boneWorlds,
  cuesBetween,
  evalPose,
  meshUv,
  pickNext,
  skinMesh,
  varsAt,
  type Puppet,
  type PuppetAnim,
  type PuppetCue,
  type PuppetState,
} from '~/composables/ui/puppet';
import { getHallPuppetDpr } from '~/composables/features/useHallLife';

const props = defineProps<{ src: string }>();
const emit = defineEmits<{
  (e: 'ready'): void;
  (e: 'failed'): void;
  /** batida nas cordas (quem toca em loop): o saguão transforma em som */
  (e: 'cue', cue: PuppetCue): void;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
let raf = 0;
let stopped = false;
let observer: ResizeObserver | null = null;
// fora da tela (câmera do mobile arrastada para o outro lado): não desenha
let visObserver: IntersectionObserver | null = null;
let onScreen = true;
let stopFit: (() => void) | null = null;
let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
const PUPPET_FPS = 30;
const PUPPET_FRAME_MS = 1000 / PUPPET_FPS;
let lastDrawMs = -Infinity;
let running = false;
let stopLoopGlobal: (() => void) | null = null;
let startLoopGlobal: (() => void) | null = null;
let puppetVisibilityHandler: (() => void) | null = null;

// passo 1: peças desenhadas na resolução da arte (1:1, sem reamostrar a pintura)
const VS = `attribute vec2 aPos; attribute vec2 aUv; uniform vec2 uSize; varying vec2 vUv;
void main(){ vUv=aUv; gl_Position=vec4(aPos.x/uSize.x*2.0-1.0, 1.0-aPos.y/uSize.y*2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; uniform sampler2D uTex; uniform float uAlpha; varying vec2 vUv;
void main(){ gl_FragColor=texture2D(uTex, vUv)*uAlpha; }`;

// passo 2: reduz para o tamanho da tela pela média da área que cada pixel cobre (como o
// INTER_AREA/Lanczos de um <img>); mipmap/bilinear direto amaciava o traço
const MAX_TAPS = 8;
const VS_DOWN = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv=aPos; gl_Position=vec4(aPos*2.0-1.0, 0.0, 1.0); }`;
const FS_DOWN = `precision highp float; uniform sampler2D uTex; uniform vec2 uSrc; uniform vec2 uDst;
uniform vec2 uTaps; varying vec2 vUv;
void main(){
  vec2 foot = uSrc / uDst;              // texels da arte por pixel da tela
  vec2 corner = vUv * uSrc - foot * 0.5;
  vec4 sum = vec4(0.0);
  for (int j = 0; j < ${MAX_TAPS}; j++) {
    if (float(j) >= uTaps.y) break;
    for (int i = 0; i < ${MAX_TAPS}; i++) {
      if (float(i) >= uTaps.x) break;
      vec2 p = corner + foot * (vec2(float(i), float(j)) + 0.5) / uTaps;
      sum += texture2D(uTex, p / uSrc);
    }
  }
  gl_FragColor = sum / (uTaps.x * uTaps.y);
}`;

interface Part {
  id: string;
  tex: WebGLTexture;
  pos: WebGLBuffer;
  uv: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
  skin?: Float32Array;
  mesh?: Puppet['draw'][number]['mesh'];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function compile(
  g: WebGLRenderingContext | WebGL2RenderingContext,
  vs: string,
  fs: string,
  names: string[],
): { prog: WebGLProgram; loc: Record<string, any> } {
  const sh = (type: number, src: string) => {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    return s;
  };
  const prog = g.createProgram()!;
  g.attachShader(prog, sh(g.VERTEX_SHADER, vs));
  g.attachShader(prog, sh(g.FRAGMENT_SHADER, fs));
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error('puppet: shader');
  const loc: Record<string, any> = {};
  for (const n of names)
    loc[n] = n.startsWith('a') ? g.getAttribLocation(prog, n) : g.getUniformLocation(prog, n);
  return { prog, loc };
}

onMounted(async () => {
  const el = canvas.value;
  if (!el) return;
  try {
    const puppet = (await (await fetch(props.src)).json()) as Puppet;
    const base = props.src.slice(0, props.src.lastIndexOf('/') + 1);
    const imgs = Object.fromEntries(
      await Promise.all(
        Object.entries(puppet.images).map(
          async ([id, [file]]) => [id, await loadImage(base + file)] as const,
        ),
      ),
    );
    if (stopped) return;
    const opts = { premultipliedAlpha: true, alpha: true, antialias: false };
    gl =
      (el.getContext('webgl2', opts) as WebGL2RenderingContext | null) ??
      (el.getContext('webgl', opts) as WebGLRenderingContext | null);
    if (!gl) throw new Error('sem WebGL');
    const g = gl;
    const draw = compile(g, VS, FS, ['aPos', 'aUv', 'uSize', 'uTex', 'uAlpha']);
    const down = compile(g, VS_DOWN, FS_DOWN, ['aPos', 'uTex', 'uSrc', 'uDst', 'uTaps']);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    const linear = () => {
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    };
    const buf = (target: number, data: ArrayBufferView, usage: number) => {
      const b = g.createBuffer()!;
      g.bindBuffer(target, b);
      g.bufferData(target, data, usage);
      return b;
    };

    const parts: Part[] = puppet.draw.map((d) => {
      const tex = g.createTexture()!;
      g.bindTexture(g.TEXTURE_2D, tex);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, imgs[d.image]!);
      linear();
      if (d.mesh) {
        const skin = new Float32Array(d.mesh.v);
        return {
          id: d.id,
          tex,
          pos: buf(g.ARRAY_BUFFER, skin, g.DYNAMIC_DRAW),
          uv: buf(g.ARRAY_BUFFER, meshUv(d.mesh, puppet.images[d.image]!), g.STATIC_DRAW),
          idx: buf(g.ELEMENT_ARRAY_BUFFER, new Uint16Array(d.mesh.tri), g.STATIC_DRAW),
          count: d.mesh.tri.length,
          skin,
          mesh: d.mesh,
        };
      }
      // imagem simples (corpo, olhos, espuma): um retângulo no lugar dela
      const [, x, y, w, h] = puppet.images[d.image]!;
      return {
        id: d.id,
        tex,
        pos: buf(
          g.ARRAY_BUFFER,
          new Float32Array([x, y, x + w, y, x + w, y + h, x, y + h]),
          g.STATIC_DRAW,
        ),
        uv: buf(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), g.STATIC_DRAW),
        idx: buf(g.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), g.STATIC_DRAW),
        count: 6,
      };
    });

    // quadro inteiro na resolução da arte, fora da tela
    const [AW, AH] = puppet.size;
    const fboTex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, fboTex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, AW, AH, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    linear();
    const fbo = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, fboTex, 0);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    const quad = buf(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), g.STATIC_DRAW);
    const quadIdx = buf(g.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), g.STATIC_DRAW);

    // tamanho REAL na tela: o saguão é ampliado por transform (scale), que clientWidth não vê;
    // medir antes da ampliação desenhava o Gloin pequeno e o navegador esticava (borrado)
    const fit = () => {
      const mobile = window.matchMedia('(max-width: 960px)').matches;
      const dpr = getHallPuppetDpr(window.devicePixelRatio || 1, mobile);
      const box = el.getBoundingClientRect();
      const w = Math.min(AW, Math.round(box.width * dpr)) || AW;
      const h = Math.min(AH, Math.round(box.height * dpr)) || AH;
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
    };
    fit();
    observer = new ResizeObserver(fit);
    observer.observe(el);
    if ('IntersectionObserver' in window) {
      visObserver = new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        if (onScreen) startLoop();
        else stopLoop();
      });
      visObserver.observe(el);
    }
    window.addEventListener('resize', fit);
    stopFit = () => window.removeEventListener('resize', fit);
    let fitTick = 0;

    // vida: parado (tempo sorteado) -> sorteia parado de novo ou um gesto, como antes no Rive
    let anim: PuppetAnim | null = null;
    let until = 0;
    let started = 0;
    const [i0, i1] = puppet.idleMs;
    // estado entre gestos (ex.: sujeira da barba: cada gole suja, limpar zera)
    const query = new URLSearchParams(window.location.search);
    let state: PuppetState = Object.fromEntries(
      Object.keys(puppet.vars ?? {}).map((k) => [k, Number(query.get(`puppet_${k}`) ?? 0)]),
    );
    let lastF = -1e-6; // último quadro do trecho atual já "tocado"
    let paused = false; // voltou de uma pausa: não dispara de uma vez as notas do tempo parado
    const next = (now: number) => {
      if (anim) state = varsAt(puppet, anim, anim.frames, state); // fim do gesto: efeito fica
      // sem peso de "parado" (ex.: bardo em loop): emenda um trecho no outro, sem pausa
      const k = anim && puppet.weights.idle > 0 ? -1 : pickNext(puppet, Math.random, state);
      // emenda: o próximo trecho começa quando o anterior TERMINOU (until), não quando o quadro percebeu (now);
      // senão cada emenda perde até um quadro e repete a pose (um tranco a cada troca de gesto).
      // Depois de muito atraso (aba em segundo plano), recomeça do agora.
      const seam = anim && k >= 0 && now - until < 250;
      anim = k >= 0 ? puppet.anims[k]! : null;
      started = seam ? until : now;
      lastF = -1e-6;
      until = started + (anim ? (anim.frames / puppet.fps) * 1000 : i0 + Math.random() * (i1 - i0));
    };
    until = performance.now() + i0 * Math.random();
    // inspeção: ?puppetT=b@1.2 congela o gesto b em 1,2 s
    // (e ?puppet_dirt=2 começa com a barba suja)
    const freeze = query.get('puppetT')?.split('@');
    const frozen = freeze ? puppet.anims.find((a) => a.name === `gesto_${freeze[0]}`) : undefined;

    const frame = (now: number) => {
      // aba oculta ou marionete fora da tela: não desenha (depois do primeiro quadro, que avisa "ready")
      if (document.hidden || (!onScreen && ready.value)) {
        paused = true;
        return;
      }
      if (now - lastDrawMs < PUPPET_FRAME_MS) return;
      lastDrawMs = now;
      // a escala do saguão pode mudar sem redimensionar a janela (zoom do palco): confere de vez em quando
      if (++fitTick % 30 === 0) fit();
      if (!frozen && now >= until) next(now);
      const playing = frozen ?? anim;
      const f = frozen
        ? Number(freeze![1] ?? 0) * puppet.fps
        : anim
          ? ((now - started) / 1000) * puppet.fps
          : 0;
      const pose = evalPose(puppet, playing, f);
      if (paused) {
        paused = false;
        lastF = Math.max(lastF, f);
      }
      if (puppet.music && anim && !frozen && f > lastF) {
        for (const cue of cuesBetween(puppet.music, puppet.fps, lastF, f)) emit('cue', cue);
        lastF = f;
      }
      applyVars(puppet, varsAt(puppet, playing, f, state), pose.opacity);
      const worlds = boneWorlds(puppet, pose);

      // passo 1: peças no quadro da arte
      g.bindFramebuffer(g.FRAMEBUFFER, fbo);
      g.viewport(0, 0, AW, AH);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      g.useProgram(draw.prog);
      g.uniform2f(draw.loc.uSize, AW, AH);
      g.uniform1i(draw.loc.uTex, 0);
      g.activeTexture(g.TEXTURE0);
      g.disableVertexAttribArray(down.loc.aPos);
      for (const p of parts) {
        const alpha = pose.opacity[p.id] ?? 1;
        if (alpha <= 0.001) continue;
        g.bindBuffer(g.ARRAY_BUFFER, p.pos);
        if (p.mesh && p.skin) {
          skinMesh(p.mesh, worlds, p.skin);
          g.bufferSubData(g.ARRAY_BUFFER, 0, p.skin);
        }
        g.enableVertexAttribArray(draw.loc.aPos);
        g.vertexAttribPointer(draw.loc.aPos, 2, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ARRAY_BUFFER, p.uv);
        g.enableVertexAttribArray(draw.loc.aUv);
        g.vertexAttribPointer(draw.loc.aUv, 2, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, p.idx);
        g.bindTexture(g.TEXTURE_2D, p.tex);
        g.uniform1f(draw.loc.uAlpha, alpha);
        g.drawElements(g.TRIANGLES, p.count, g.UNSIGNED_SHORT, 0);
      }

      // passo 2: média por área até o tamanho da tela (cópia direta, já pré-multiplicada)
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, el.width, el.height);
      g.disable(g.BLEND);
      g.clear(g.COLOR_BUFFER_BIT);
      g.useProgram(down.prog);
      g.disableVertexAttribArray(draw.loc.aUv);
      g.bindBuffer(g.ARRAY_BUFFER, quad);
      g.enableVertexAttribArray(down.loc.aPos);
      g.vertexAttribPointer(down.loc.aPos, 2, g.FLOAT, false, 0, 0);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, quadIdx);
      g.bindTexture(g.TEXTURE_2D, fboTex);
      g.uniform1i(down.loc.uTex, 0);
      g.uniform2f(down.loc.uSrc, AW, AH);
      g.uniform2f(down.loc.uDst, el.width, el.height);
      g.uniform2f(
        down.loc.uTaps,
        Math.min(MAX_TAPS, Math.max(1, Math.ceil(AW / el.width))),
        Math.min(MAX_TAPS, Math.max(1, Math.ceil(AH / el.height))),
      );
      g.drawElements(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0);

      if (!ready.value) {
        ready.value = true;
        emit('ready');
      }
      if (running) raf = requestAnimationFrame(frame);
    };
    function stopLoop() {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    function startLoop() {
      if (running || stopped || document.hidden || (!onScreen && ready.value)) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function handleVisibility() {
      if (document.hidden) stopLoop();
      else startLoop();
    }
    stopLoopGlobal = stopLoop;
    startLoopGlobal = startLoop;
    puppetVisibilityHandler = handleVisibility;
    document.addEventListener('visibilitychange', handleVisibility);
    running = true;
    raf = requestAnimationFrame(frame);
  } catch {
    emit('failed');
  }
});

onBeforeUnmount(() => {
  stopped = true;
  stopLoopGlobal?.();
  if (puppetVisibilityHandler) {
    document.removeEventListener('visibilitychange', puppetVisibilityHandler);
  }
  cancelAnimationFrame(raf);
  observer?.disconnect();
  visObserver?.disconnect();
  stopFit?.();
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
});
</script>

<style scoped>
.puppet-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 200ms linear;
}

.puppet-canvas.is-ready {
  opacity: 1;
}
</style>

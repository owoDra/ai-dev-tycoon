import { For, onCleanup, onMount } from 'solid-js';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { type ModelAsset, type ModelId, modelAssets } from '../../assets/catalog';
import { getTexture } from '../../assets/registry';
import { visual } from '../../content/look/visual';
import { expressions, worldLooks } from '../../content/look/world';
import { loadModelGeometries } from '../../world/geometry';
import { createMaterials, scaleColor } from '../../world/materials';

/** 並べて見比べるモデル（人間4種・Agent 4種・小物）。人間には表情のアトラスの4コマを順に貼る */
const rows: readonly (readonly ModelId[])[] = [
  ['humanBob', 'humanCap', 'humanGlasses', 'humanBun'],
  ['agentResearch', 'agentCode', 'agentQa', 'agentRelease'],
  ['desk', 'monitor', 'plant', 'serverRack', 'conveyor', 'packet'],
];
const SPACING = 1.6;

/** 生成したモデルの一覧（開発用）。ワールドと同じトゥーンのマテリアルとアウトラインで1回だけ描く */
export function ModelGallery(props: { label: string; onStatus: (status: 'ready' | 'error') => void }) {
  let canvas!: HTMLCanvasElement;

  onMount(() => {
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const look = worldLooks.standard;
    scene.add(new AmbientLight('#ffffff', look.shading.ambient));
    const sun = new DirectionalLight('#ffffff', look.shading.sun);
    sun.position.set(4, 10, 8);
    scene.add(sun);
    let disposed = false;

    const draw = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      renderer.setSize(w, h, false);
      const viewH = rows.length * 1.9;
      const aspect = w / Math.max(1, h);
      Object.assign(camera, {
        left: (-viewH * aspect) / 2,
        right: (viewH * aspect) / 2,
        top: viewH / 2,
        bottom: -viewH / 2,
      });
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    void Promise.all([
      loadModelGeometries(),
      getTexture('toonGradient'),
      getTexture('blobShadow'),
      getTexture('faceAtlas'),
    ])
      .then(([models, gradient, blob, atlas]) => {
        if (disposed) return;
        scene.background = null;
        renderer.setClearColor(scaleColor(look.environment.background, visual));
        const materials = createMaterials(look, visual, { gradient, blob });
        rows.forEach((row, r) => {
          row.forEach((id, i) => {
            const geometry = models.get(id);
            if (!geometry) return;
            const x = (i - (row.length - 1) / 2) * SPACING;
            const y = (rows.length - 1) / 2 - r;
            const scale = id === 'packet' ? 0.45 : id === 'serverRack' ? 0.55 : id === 'desk' ? 0.8 : 1;
            for (const material of [materials.vertex, materials.outline]) {
              const mesh = new Mesh(geometry, material);
              mesh.position.set(x, y * 1.9 - 0.7, 0);
              mesh.scale.setScalar(scale);
              mesh.rotation.set(0.35, id === 'conveyor' ? Math.PI / 2 : -0.35, 0);
              scene.add(mesh);
              const face = (modelAssets[id] as ModelAsset).face;
              if (face && material === materials.vertex) {
                const map = atlas.clone();
                const e = id.startsWith('human') ? i : 0;
                map.repeat.set(0.5, 0.5);
                map.offset.set((e % 2) * 0.5, e < 2 ? 0.5 : 0);
                const plane = new Mesh(
                  new PlaneGeometry(face.size, face.size).translate(0, face.y, face.z),
                  new MeshBasicMaterial({ map, transparent: true, alphaTest: 0.1 }),
                );
                mesh.add(plane);
              }
            }
          });
        });
        camera.position.set(0, 0, 20);
        camera.lookAt(0, 0, 0);
        draw();
        props.onStatus('ready');
      })
      .catch((e: unknown) => {
        console.error(e);
        props.onStatus('error');
      });

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    onCleanup(() => {
      disposed = true;
      observer.disconnect();
      renderer.dispose();
    });
  });

  return (
    <div class="flex flex-col gap-2">
      <canvas ref={canvas} class="block h-[32rem] w-full rounded-md" role="img" aria-label={props.label} />
      <ul class="grid grid-cols-2 gap-x-4 text-sm text-ink-muted sm:grid-cols-4">
        <For each={rows.flat()}>{(id) => <li class="font-mono">{modelAssets[id].file}</li>}</For>
      </ul>
      <p class="text-sm text-ink-muted">{expressions.join(' / ')}</p>
    </div>
  );
}

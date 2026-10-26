import { onCleanup, onMount } from 'solid-js';
import {
  AmbientLight,
  CircleGeometry,
  DirectionalLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  type Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { getModel, getTexture } from '../../assets/registry';

/**
 * デスクモデルの回転表示。左は glb のマテリアル（頂点カラー + 焼き込んだ AO）、
 * 右は同じモデルにトゥーンのグラデーションマップを当てたもの。床にはタイルのテクスチャを敷く。
 * prefers-reduced-motion のときは回転させない。
 */
export function DeskViewer(props: { label: string; onStatus: (status: 'ready' | 'error') => void }) {
  let canvas!: HTMLCanvasElement;

  onMount(() => {
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new Scene();
    const camera = new OrthographicCamera(-1.9, 1.9, 1.1, -1.1, 0.1, 50);
    // 見下ろしのアイソメトリック（Phase 05 で正式なカメラを決める）
    camera.position.set(6, 5.2, 6);
    camera.lookAt(0, 0.35, 0);
    scene.add(new AmbientLight('#ffffff', 1.4));
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(3, 6, 2);
    scene.add(sun);

    const spinning: Object3D[] = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      renderer.setSize(w, h, false);
      const aspect = w / Math.max(1, h);
      camera.left = -1.1 * aspect;
      camera.right = 1.1 * aspect;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const tick = (t: number) => {
      if (disposed) return;
      if (!reduced) for (const o of spinning) o.rotation.y = t / 2500;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };

    void Promise.all([getModel('desk'), getModel('desk'), getTexture('floor'), getTexture('toonGradient')])
      .then(([standard, toon, floorTexture, gradient]) => {
        if (disposed) return;
        floorTexture.repeat.set(3, 3);
        const placements: [Object3D, number][] = [
          [standard, -0.95],
          [toon, 0.95],
        ];
        for (const [model, x] of placements) {
          const disc = new Mesh(new CircleGeometry(0.95, 40), new MeshBasicMaterial({ map: floorTexture }));
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(x, 0, -x);
          scene.add(disc);
          model.position.set(x, 0, -x);
          scene.add(model);
          spinning.push(model);
        }
        toon.traverse((o) => {
          if (o instanceof Mesh) {
            const toonMaterial = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
            (o.material as Material).dispose();
            o.material = toonMaterial;
          }
        });
        resize();
        props.onStatus('ready');
        frame = requestAnimationFrame(tick);
      })
      .catch((e: unknown) => {
        console.error(e);
        props.onStatus('error');
      });

    onCleanup(() => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
    });
  });

  return <canvas ref={canvas} class="block h-80 w-full" role="img" aria-label={props.label} />;
}

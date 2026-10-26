import { render } from 'solid-js/web';
import './styles/index.css';
import { ja } from './i18n/ja';

// 仮の起動画面。画面遷移とゲームループは後続 Phase で app/ に作る
function App() {
  return (
    <main class="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <h1 class="text-4xl font-bold tracking-tight text-amber-300">{ja.title}</h1>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つからない');
render(() => <App />, root);

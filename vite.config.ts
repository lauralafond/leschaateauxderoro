import { defineConfig, PluginOption } from "vite";
import { enterDevPlugin, enterProdPlugin } from 'vite-plugin-enter-dev';
import path from "path";

// Set only by .github/workflows/static.yml when building for GitHub Pages,
// which serves this project from https://lauralafond.github.io/leschaateauxderoro/
// instead of a domain root. Left unset everywhere else (local dev, Enter's own
// build/preview/publish pipeline), which always serves from the root — so
// this must never change unless that env var is explicitly set.
const GITHUB_PAGES_BASE_PATH = '/leschaateauxderoro/';
const isGithubPagesBuild = process.env.GITHUB_PAGES_BASE === '1';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins = [
    ...enterProdPlugin(),
  ];
  if (mode === 'development') {
    plugins.push(...enterDevPlugin());
  }
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: plugins.filter(Boolean) as PluginOption[],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: isGithubPagesBuild ? GITHUB_PAGES_BASE_PATH : '/',
    build: {
      outDir: 'dist',
    }
  };
});
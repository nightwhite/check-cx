import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [
      tailwindcss(),
      {
        // @lobehub/icons 的 ESM 入口使用无扩展名/目录导入，Node 无法直接解析。
        // 静态构建的 prerender 环境会把依赖外置，这里强制交给 Vite 打包。
        name: "bundle-lobehub-icons",
        configEnvironment(name, options) {
          if (name !== "prerender" && name !== "ssr") return;
          const current = options.resolve?.noExternal;
          const list = Array.isArray(current) ? current : current ? [current] : [];
          if (!list.includes("@lobehub/icons")) {
            return {
              resolve: { noExternal: [...list, "@lobehub/icons"] },
            };
          }
        },
      },
    ],
  },
});

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}

interface ImportMetaEnv {
  // 网站标题，应用名称
  readonly VITE_APP_TITLE: string
  // API基础地址
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __UNI_PLATFORM__: 'app' | 'h5' | 'mp-weixin' | 'mp-toutiao' | 'mp-alipay'

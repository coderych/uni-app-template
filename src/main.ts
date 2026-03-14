import * as Pinia from 'pinia'

import { createSSRApp } from 'vue'
import App from './App.vue'
import 'uno.css'

// WebStorm 类型提示
import 'sard-uniapp/global.d.ts'

export function createApp() {
  const app = createSSRApp(App)
  app.use(Pinia.createPinia())
  return {
    app,
    Pinia,
  }
}

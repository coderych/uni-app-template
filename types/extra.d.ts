import '@uni-helper/vite-plugin-uni-pages'

declare module '@uni-helper/vite-plugin-uni-pages' {
  interface PageMetaDatum {
    layout?: 'default' | 'home' | 'tabbar'
  }

  interface TabBarItem {
    iconType?: 'ui' | 'static'
    icon?: string
  }
}

export {}

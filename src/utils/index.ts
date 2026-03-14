import type { PageMetaDatum, SubPackage } from '@uni-helper/vite-plugin-uni-pages'
import { pages, subPackages } from 'virtual:uni-pages'

export function getLastPage() {

}

/**
 * 获取所有页面
 * @param key 页面是否需要登录
 * @returns 所有页面
 */
export function getAllPages(key = 'needLogin') {
  // 这里处理主包
  const mainPages: PageMetaDatum[] = pages
    .filter(page => !key || page[key])
    .map(page => ({
      ...page,
      path: `/${page.path}`,
    }))

  // 这里处理分包
  const subPages: PageMetaDatum[] = []
  subPackages.forEach((subPageObj: SubPackage) => {
    const { root } = subPageObj

    subPageObj.pages
      .filter(page => !key || page[key])
      .forEach((page: { path: string } & PageMetaDatum) => {
        subPages.push({
          ...page,
          path: `/${root}/${page.path}`,
        })
      })
  })
  const result = [...mainPages, ...subPages]
  // console.log(`getAllPages by ${key} result: `, result)
  return result
}

/**
 * 获取所有需要登录的页面
 * @returns 所有需要登录的页面
 */
export const getNeedLoginPages = (): string[] => getAllPages('needLogin').map(page => page.path)

/**
 * 所有需要登录的页面
 */
export const needLoginPages: string[] = getAllPages('needLogin').map(page => page.path)

export const platform = __UNI_PLATFORM__
export const isH5 = __UNI_PLATFORM__ === 'h5'
export const isApp = __UNI_PLATFORM__ === 'app'
export const isMp = __UNI_PLATFORM__.startsWith('mp-')
export const isMpWeixin = __UNI_PLATFORM__.startsWith('mp-weixin')
export const isMpAplipay = __UNI_PLATFORM__.startsWith('mp-alipay')
export const isMpToutiao = __UNI_PLATFORM__.startsWith('mp-toutiao')

export const PLATFORM = {
  platform,
  isH5,
  isApp,
  isMp,
  isMpWeixin,
  isMpAplipay,
  isMpToutiao,
}

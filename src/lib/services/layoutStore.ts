import { PageProps } from '@/types/charts'

const headers = { 'Content-Type': 'application/json' }

export function createLayoutStore(baseUrl: string = '/api/charts') {
  return {
    async getPageList(): Promise<PageProps[] | false> {
      try {
        const res = await fetch(baseUrl, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        console.error('getPageList error:', e)
        return false
      }
    },

    async getPageById(pageId: string): Promise<PageProps | false> {
      try {
        const res = await fetch(`${baseUrl}/${pageId}`, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        console.error('getPageById error:', e)
        return false
      }
    },

    async savePage(data: PageProps): Promise<PageProps | false> {
      const exists = await this.getPageById(data.id)
      return exists ? this.updatePage(data) : this.insertPage(data)
    },

    async insertPage(data: PageProps): Promise<PageProps | false> {
      try {
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        console.error('insertPage error:', e)
        return false
      }
    },

    async updatePage(data: PageProps): Promise<PageProps | false> {
      try {
        const res = await fetch(`${baseUrl}/${data.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        console.error('updatePage error:', e)
        return false
      }
    },

    async deletePage(pageId: string): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/${pageId}`, { method: 'DELETE', headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return true
      } catch (e) {
        console.error('deletePage error:', e)
        return false
      }
    },
  }
}

export type LayoutStore = ReturnType<typeof createLayoutStore>

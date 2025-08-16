import { PageProps } from '@/types/charts'

const webApiUrl = "/api/charts"; // Will be proxied to json-server
const apiJsonHeaders = {
  'Content-Type': 'application/json'
};

export default {
  async getPageList(): Promise<PageProps[] | false> {
    try {
      const response = await fetch(webApiUrl, {
        method: "GET",
        headers: apiJsonHeaders,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json() as PageProps[];
    } catch (error) {
      console.error("getPageList error:", error);
      return false;
    }
  },

  async getPageById(pageId: string): Promise<PageProps | false> {
    try {
      const response = await fetch(`${webApiUrl}/${pageId}`, {
        method: "GET",
        headers: apiJsonHeaders,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json() as PageProps;
    } catch (error) {
      console.error("getPageById error:", error);
      return false;
    }
  },

  async exists(pageId: string): Promise<boolean> {
    const result = await this.getPageById(pageId);
    return result !== false;
  },

  async savePage(data: PageProps): Promise<PageProps | false> {
    if (await this.exists(data.id)) {
      return this.updatePage(data);
    }
    return this.insertPage(data);
  },

  async insertPage(data: PageProps): Promise<PageProps | false> {
    try {
      console.log("insertPage", JSON.stringify(data));
      const response = await fetch(webApiUrl, {
        method: "POST",
        headers: apiJsonHeaders,
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json() as PageProps;
    } catch (error) {
      console.error("insertPage error:", error);
      return false;
    }
  },

  async updatePage(data: PageProps): Promise<PageProps | false> {
    try {
      console.log("updatePage", JSON.stringify(data));
      const response = await fetch(`${webApiUrl}/${data.id}`, {
        method: "PUT",
        headers: apiJsonHeaders,
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json() as PageProps;
    } catch (error) {
      console.error("updatePage error:", error);
      return false;
    }
  },

  async deletePage(pageId: string): Promise<PageProps | false> {
    try {
      const response = await fetch(`${webApiUrl}/${pageId}`, {
        method: "DELETE",
        headers: apiJsonHeaders,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json() as PageProps;
    } catch (error) {
      console.error("deletePage error:", error);
      return false;
    }
  }
};
'use client';
import { createContext, useState, useContext, useEffect } from 'react';
import layoutStore from '@/services/layoutStore';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [currentPage, setCurrentPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    dynasties: [],
    persons: [],
    relationships: [],
    events: [],
  });
  const [selectedNode, setSelectedNode] = useState(null);

  const loadPageList = async () => {
    try {
      setLoading(true);
      const pages = await layoutStore.getPageList();
      return pages || [];
    } catch (error) {
      console.error('Failed to load page list:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadPage = async (pageId) => {
    try {
      setLoading(true);
      const pageData = await layoutStore.getPageById(pageId);
      if (pageData) {
        setCurrentPage(prev => ({
          ...prev,
          ...pageData
        }));
        setData(pageData.chartProps);
        return currentPage;
      } else {
        if (currentPage?.id && currentPage.id === pageId) {
          console.log("new page");
          return currentPage;
        }
      }
    } catch (error) {
      console.error('Data loading error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const savePage = async () => {
    try {
      if (!currentPage?.id) return false;

      const pageData = {
        ...currentPage,
        chartProps: data
      };

      const savedPage = await layoutStore.savePage(pageData);
      if (savedPage) {
        setCurrentPage(savedPage);
        setData(savedPage.chartProps);
      }
      return currentPage;
    } catch (error) {
      console.error('Save failed:', error);
      return false;
    }
  };

  const updatePage = async (pageProps) => {
    try {
      const savedPage = await layoutStore.updatePage(pageProps);
      if (savedPage) {
        setCurrentPage(savedPage);
        setData(savedPage.chartProps);
      }
      return currentPage;
    } catch (error) {
      console.error('Save failed:', error);
      return false;
    }
  };

  const deletePage = async (pageId) => {
    try {
      const pageData = await layoutStore.deletePage(pageId);
      if (pageData !== false) {
        return pageData;
      }
      setCurrentPage(null);
      setData(null);
    } catch (error) {
      console.error('Data deleting error:', error);
      return false;
    }
  };

  const insertPage = async (pageData) => {
    try {
      const newPage = await layoutStore.insertPage(pageData);
      if (newPage) {
        setCurrentPage(newPage);
        setData(newPage.chartProps);
      }
      return currentPage;
    } catch (error) {
      console.error('Save failed:', error);
      return false;
    }
  }

  const clearPage = async () => {
    const chartProps = {
      dynasties: [],
      persons: [],
      relationships: [],
      events: [],
    };
    const pageProps = currentPage;
    pageProps.chartProps = chartProps;
    setCurrentPage(pageProps);
    setData(pageProps.chartProps);
  }

  const addPerson = async (person) => {
    //initialize position
    let fx = 400;
    let fy = 300;
    const last = data?.persons.findLastIndex(e => e.fx !== undefined && e.fy !== undefined);
    if (last >= 0) {
      fx = data?.persons[last].fx + 80;
      fy = data?.persons[last].fy + 80;
    }
    const newPerson = {
      ...person,
      id: `person_${Date.now()}`,
      fx: fx,
      fy: fy
    };

    setData(prev => ({
      ...prev,
      persons: [...prev.persons, newPerson]
    }));

    console.log("addPerson", JSON.stringify(data.persons));

    return newPerson;
  };

  const updatePerson = (id, updates) => {
    setData(prev => ({
      ...prev,
      persons: prev.persons.map(p =>
        p.id === id ? { ...p, ...updates } : p
      )
    }));
  };

  const deletePerson = (id) => {
    setData(prev => ({
      ...prev,
      persons: prev.persons.filter(p => p.id !== id),
      relationships: prev.relationships.filter(rel =>
        rel.source !== id && rel.target !== id
      )
    }));
  };

  const updatePersonPosition = (id, x, y) => {
    setData(prev => ({
      ...prev,
      persons: prev.persons.map(p =>
        p.id === id ? { ...p, x, y, fx: x, fy: y } : p
      )
    }));
  };

  const addRelationship = (relationship) => {
    const newRel = {
      ...relationship,
      id: `rel_${Date.now()}`
    };

    setData(prev => ({
      ...prev,
      relationships: [...prev.relationships, newRel]
    }));

    return newRel;
  };

  const deleteRelationship = (id) => {
    setData(prev => ({
      ...prev,
      relationships: prev.relationships.filter(rel => rel.id !== id)
    }));
  };

  return (
    <DataContext.Provider
      value={{
        // Data state
        ...data,
        currentPage,

        // Loading state
        loading,

        // Page management
        setCurrentPage,
        loadPageList,
        loadPage,
        savePage,
        insertPage,
        updatePage,
        deletePage,
        clearPage,
        updatePersonPosition,

        // Person operations
        addPerson,
        updatePerson,
        deletePerson,

        // Relationship operations
        addRelationship,
        deleteRelationship,

        selectedNode,
        setSelectedNode
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => useContext(DataContext);
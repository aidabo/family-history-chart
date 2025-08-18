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
  const [selectedRelationship, setSelectedRelationship] = useState(null);

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
    setData(prev => {
      // Find the person being deleted
      const personToDelete = prev.persons.find(p => p.id === id);

      // If it's a union node (marriage), delete all partner relationships connected to it
      let relationshipsToKeep = [...prev.relationships];
      let personsToKeep = [...prev.persons];

      if (personToDelete?.type === 'union') {
        // Delete all partner relationships connected to this union node
        relationshipsToKeep = relationshipsToKeep.filter(rel =>
          !(rel.target === id && rel.type === 'partner')
        );
      } else {
        // If it's a regular person, check if they're part of a marriage
        const partnerRels = relationshipsToKeep.filter(rel =>
          rel.source === id && rel.type === 'partner'
        );

        // For each partner relationship, delete the union node and its relationships
        partnerRels.forEach(rel => {
          const unionNodeId = rel.target;

          // Delete the union node
          personsToKeep = personsToKeep.filter(p => p.id !== unionNodeId);

          // Delete all partner relationships for this union
          relationshipsToKeep = relationshipsToKeep.filter(r =>
            !(r.target === unionNodeId && r.type === 'partner')
          );
        });
      }

      // Delete the person and any relationships connected to them
      return {
        ...prev,
        persons: personsToKeep.filter(p => p.id !== id),
        relationships: relationshipsToKeep.filter(rel =>
          rel.source !== id && rel.target !== id
        )
      };
    });
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
    if (relationship.type === 'marriage') {

      // Create union node for marriage
      const source = data.persons.find(p => p.id == relationship.source);
      const target = data.persons.find(p => p.id == relationship.target);
      const name = `(${source.name} - ${target.name})`;
      const fx = source.fx && target.fx ? (source.fx + target.fx) / 2 : undefined;
      const fy = source.fy && target.fy ? (source.fy + target.fy) / 2 : undefined;
      const unionNode = {
        id: `union_${Date.now()}`,
        name: name,
        type: 'union',
        marriage: {
          start: relationship.start,
          end: relationship.end,
          label: relationship.label
        },
        x: 0,
        y: 0,
        fx: fx,
        fy: fy
      };

      // Create partner relationships
      const partner1 = {
        id: `rel_${Date.now()}_1`,
        source: relationship.source,
        target: unionNode.id,
        type: 'partner',
        label: ''
      };

      const partner2 = {
        id: `rel_${Date.now()}_2`,
        source: relationship.target,
        target: unionNode.id,
        type: 'partner',
        label: ''
      };

      setData(prev => ({
        ...prev,
        persons: [...prev.persons, unionNode],
        relationships: [...prev.relationships, partner1, partner2]
      }));

      return unionNode;
    } else {
      // For other relationships
      const newRel = {
        ...relationship,
        id: `rel_${Date.now()}`
      };

      setData(prev => ({
        ...prev,
        relationships: [...prev.relationships, newRel]
      }));

      return newRel;
    }
  };

  const updateRelationship = (id, updates) => {
    setData(prev => ({
      ...prev,
      relationships: prev.relationships.map(rel =>
        rel.id === id ? { ...rel, ...updates } : rel
      )
    }));
  };

  const deleteRelationship = (id) => {
    setData(prev => {
      const relationshipToDelete = prev.relationships.find(rel => rel.id === id);

      // If deleting a partner relationship, also delete the union node
      if (relationshipToDelete?.type === 'partner') {
        const unionNodeId = relationshipToDelete.target;

        return {
          ...prev,
          persons: prev.persons.filter(p => p.id !== unionNodeId),
          relationships: prev.relationships.filter(rel =>
            rel.id !== id && rel.target !== unionNodeId
          )
        };
      }

      // For other relationships, just delete the single relationship
      return {
        ...prev,
        relationships: prev.relationships.filter(rel => rel.id !== id)
      };
    });
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
        updateRelationship,
        deleteRelationship,

        selectedNode,
        setSelectedNode,
        selectedRelationship,
        setSelectedRelationship
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => useContext(DataContext);
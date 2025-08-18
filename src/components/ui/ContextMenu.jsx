'use client';
import { useState, useEffect } from 'react';

const ContextMenu = ({ onDeletePerson, onDeleteRelationship }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [target, setTarget] = useState(null);
  const [isRelationship, setIsRelationship] = useState(false);

  useEffect(() => {
    const handleContextMenu = (e) => {
      e.preventDefault();
      console.log("contextMune", e);
      
      const node = e.target.closest('.node');
      const link = e.target.closest('.relationship');
      
      if (node) {
        const id = node.dataset.id;
        if (id) {
          setTarget(id);
          setIsRelationship(false);
          setPosition({ x: e.pageX, y: e.pageY });
          setShowMenu(true);
        }
      } else if (link) {
        const id = link.dataset.id;
        if (id) {
          setTarget(id);
          setIsRelationship(true);
          setPosition({ x: e.pageX, y: e.pageY });
          setShowMenu(true);
        }
      }
    };

    const handleClick = () => {
      if (showMenu) setShowMenu(false);
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, [showMenu]);

  const handleDelete = () => {
    if (isRelationship) {
      onDeleteRelationship(target);
    } else {
      onDeletePerson(target);
    }
    setShowMenu(false);
  };

  if (!showMenu) return null;

  return (
    <div 
      className="absolute bg-white border border-gray-200 shadow-lg rounded-md z-50 py-1 min-w-[150px]"
      style={{ left: position.x, top: position.y }}
    >
      <button
        onClick={handleDelete}
        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 block hover:font-medium"
      >
        Delete {isRelationship ? 'Relationship' : 'Node'}
      </button>
    </div>
  );
};

export default ContextMenu;
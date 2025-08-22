'use client';
import { useState, useEffect } from 'react';
import { useDataContext } from '@/context/DataContext';
import PropTypes from 'prop-types';

const RelationshipForm = ({ onClose, relationship }) => {
  const { persons, updatePerson, addRelationship, updateRelationship } = useDataContext();
  const [form, setForm] = useState({
    source: '',
    target: '',
    type: 'parent-child',
    start: '',
    end: '',
    label: 'Child'
  });

  const defaultLabels = {
      'parent-child': 'Child',
      'marriage': 'Marriage',
      'sibling': 'Sibling',
      'succession': 'Succession',
      'partner': 'Partner'
    };


  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (relationship) {
      // For marriage relationships, we'll get the data directly from the relationship object
      setIsEditing(true);
      if (relationship.type === 'marriage') {
        setForm({
          source: relationship.source,
          target: relationship.target,
          type: 'marriage',
          start: relationship.start || '',
          end: relationship.end || '',
          label: relationship.label || 'Marriage'
        });
      } else {
        // Normal relationship handling
        setForm({
          source: relationship.source,
          target: relationship.target,
          type: relationship.type,
          start: relationship.start || '',
          end: relationship.end || '',
          label: relationship.label || ''
        });
      }      
    } else if (persons.length > 0) {
      // Initialize for new relationship
      setIsEditing(false);
      setForm({
        source: persons[0]?.id || '',
        target: persons.length > 1 ? persons[1]?.id : persons[0]?.id || '',
        type: 'parent-child',
        start: '',
        end: '',
        label: 'Child'
      });      
    }
  }, [persons, relationship]);


  // Update label when type changes
  useEffect(() => {
    // Only update if we're not editing or if the label is empty
    if (!isEditing) {
      setForm(prev => ({
        ...prev,
        label: prev.label || defaultLabels[prev.type]
      }));
    }
  }, [form.type, isEditing]);

  const handleChange = (e) => {
    if(e.target.name === 'type'){
      setForm({ ...form, [e.target.name]: e.target.value, label: defaultLabels[e.target.value]});  
    }else{
      setForm({ ...form, [e.target.name]: e.target.value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.source === form.target) {
      alert('Source and target cannot be the same person');
      return;
    }

    try {
      if (isEditing && relationship) {
        // Special handling for marriage updates
        if (relationship.type === 'marriage') {
          // Find the union node
          const unionNode = persons.find(p => p.id === relationship.id && p.type === 'union');

          if (unionNode) {
            // Update the union node with new marriage info
            await updatePerson(unionNode.id, {
              marriage: {
                label: form.label,
                start: form.start,
                end: form.end
              }
            });
          }
        } else {
          // Normal relationship update
          await updateRelationship(relationship.id, form);
        }
      } else {
        // Create new relationship
        await addRelationship(form);
      }

      if (onClose) onClose();
    } catch (error) {
      console.error('Error saving relationship:', error);
      alert('Failed to save relationship');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">
        {isEditing ? "Edit Relationship" : "Create Relationship"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">        
        <div>
          <label className="block text-sm font-medium text-gray-800">Relationship Type</label>
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            required
            disabled={isEditing} // Disable type change when editing
          >
            <option value="parent-child">Parent-Child</option>
            <option value="marriage">Marriage</option>
            <option value="sibling">Sibling</option>
            <option value="succession">Succession</option>
            {/* {!isEditing && <option value="partner">Partner</option>} */}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            {form.type === 'parent-child' ? 'Parent' : 'Source Person'}
          </label>
          <select
            name="source"
            value={form.source}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            required
            disabled={isEditing && form.type === 'partner'} // Disable for partner relationships
          >
            {persons.filter(person=>(form.type === 'marriage' || form.type === 'sibling')? person.type !== 'union' : true).map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            {form.type === 'parent-child' ? 'Child' : 'Target Person'}
          </label>
          <select
            name="target"
            value={form.target}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            required
            disabled={isEditing && form.type === 'partner'} // Disable for partner relationships
          >
            {persons.filter(person=>(form.type === 'marriage' || form.type === 'sibling')? person.type !== 'union' : true).map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            Relationship Label
          </label>
          <input
            type="text"
            name="label"
            value={form.label}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800">Start Year (optional)</label>
            <input
              type="number"
              name="start"
              value={form.start}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
              min="0"
              max="3000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800">End Year (optional)</label>
            <input
              type="number"
              name="end"
              value={form.end}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
              min="0"
              max="3000"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            {isEditing ? "Update Relationship" : "Create Relationship"}
          </button>
        </div>
      </form>
    </div>
  );
};

RelationshipForm.propTypes = {
  onClose: PropTypes.func.isRequired,
  relationship: PropTypes.shape({
    id: PropTypes.string,
    source: PropTypes.string,
    target: PropTypes.string,
    type: PropTypes.string,
    start: PropTypes.string,
    end: PropTypes.string,
    label: PropTypes.string
  })
};

export default RelationshipForm;
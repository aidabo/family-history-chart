'use client';
import { useState, useEffect } from 'react';
import { useDataContext } from '@/context/DataContext';
import PropTypes from 'prop-types';

const RelationshipForm = ({ onClose }) => {
  const { persons, addRelationship } = useDataContext();
  const [form, setForm] = useState({
    source: '',
    target: '',
    type: 'parent-child',
    start: '',
    end: '',
    label: 'Child'
  });

  useEffect(() => {
    if (persons.length > 0) {
      setForm(prev => ({
        ...prev,
        source: persons[0]?.id || '',
        target: persons.length > 1 ? persons[1]?.id : persons[0]?.id || ''
      }));
    }
  }, [persons]);

    // Update label when type changes
  useEffect(() => {
    const labels = {
      'parent-child': 'Child',
      'marriage':     'Marriage',
      'sibling':      'Sibling',
      'succession':   'Succession'
    };
    
    setForm(prev => ({
      ...prev,
      label: labels[prev.type] || prev.label
    }));
  }, [form.type]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (form.source === form.target) {
      alert('Source and target cannot be the same person');
      return;
    }
    
    await addRelationship(form);
    if (onClose) onClose();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Create Relationship</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
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
          >
            {persons.map(person => (
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
          >
            {persons.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">Relationship Type</label>
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            required
          >
            <option value="parent-child">Parent-Child</option>
            <option value="marriage">Marriage</option>
            <option value="sibling">Sibling</option>
            <option value="succession">Succession</option>
          </select>
        </div>

        {/* Add custom label input */}
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
              max="2023"
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
              max="2023"
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
            Create Relationship
          </button>
        </div>
      </form>
    </div>
  );
};

RelationshipForm.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default RelationshipForm;
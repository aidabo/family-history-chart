'use client';
import { useState, useEffect } from 'react';
import { useDataContext } from '@/context/DataContext';

const NodeEditor = () => {
  const { selectedNode, addPerson, updatePerson, setSelectedNode, uploadImage } = useDataContext();
  const [form, setForm] = useState({
    name: '',
    birth: '',
    age: '',
    gender: 'male',
    title: '',
    profileUrl: '',
    description: '',
    image: '',
    nodeSize: 40,
    labelColor: '#334155',
    labelFontSize: 12,
    descriptionWidth: 80,
    descriptionPosition: 'below'
  });
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setForm({
        name: selectedNode.name || '',
        birth: selectedNode.birth || '',
        age: selectedNode.age || '',
        gender: selectedNode.gender || 'male',
        title: selectedNode.title || '',
        profileUrl: selectedNode.profileUrl || '',
        description: selectedNode.description || '',
        image: selectedNode.image || '',
        nodeSize: selectedNode.nodeSize || 40,
        labelColor: selectedNode.labelColor || '#334155',
        labelFontSize: selectedNode.labelFontSize || 12,
        descriptionWidth: selectedNode.descriptionWidth || selectedNode.nodeSize * 2,
        descriptionPosition: selectedNode.descriptionPosition || 'below',
      });
    } else {
      setForm({
        name: '',
        birth: '',
        age: '',
        gender: 'male',
        title: '',
        profileUrl: '',
        description: '',
        image: '',
        nodeSize: 40,
        labelColor: '#334155',
        labelFontSize: 12,
        descriptionWidth: 80,
        descriptionPosition: 'below'        
      });
    }
  }, [selectedNode]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (uploadImage) {
      // Use upload handler if available
      setIsUploading(true);
      try {
        const imageUrl = await uploadImage(file);
        setForm({ ...form, image: imageUrl });
      } catch (error) {
        console.error("Image upload failed:", error);
      } finally {
        setIsUploading(false);
      }
    } else {
      // Fallback to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        setForm({ ...form, image: event.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const personData = {
      ...form,
      birth: form.birth ? parseInt(form.birth) : null,
      age: form.age ? parseInt(form.age) : null,
      nodeSize: parseInt(form.nodeSize),
      labelFontSize: parseInt(form.labelFontSize)
    };

    if (selectedNode) {
      await updatePerson(selectedNode.id, personData);
    } else {
      await addPerson(personData);
    }
  };

  return (
    <div className="space-y-4">
      {form.image && (
        <div className="flex justify-center">
          <img
            src={form.image}
            alt="Preview"
            className="w-32 h-32 rounded-full object-cover border-4 border-white shadow"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">
          {form.image ? 'Change Image' : 'Upload Image'}
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          disabled={isUploading}
          className="block w-full text-sm text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        {isUploading && (
          <p className="mt-1 text-xs text-gray-500">Uploading image...</p>
        )}
      </div>

      {/* Rest of the form remains the same */}
      <div>
        <label className="block text-sm font-medium text-gray-800">Name</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800">Birth Year</label>
          <input
            type="number"
            name="birth"
            value={form.birth}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            min="0"
            max="2023"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">Age</label>
          <input
            type="number"
            name="age"
            value={form.age}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
            min="0"
            max="2023"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800">Gender</label>
        <div className="mt-1 flex space-x-4">
          <label className="inline-flex items-center">
            <input
              type="radio"
              name="gender"
              value="male"
              checked={form.gender === 'male'}
              onChange={handleChange}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-gray-800">Male</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              name="gender"
              value="female"
              checked={form.gender === 'female'}
              onChange={handleChange}
              className="text-pink-600 focus:ring-pink-500"
            />
            <span className="ml-2 text-gray-800">Female</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800">Title</label>
        <input
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800">Profile URL</label>
        <input
          type="url"
          name="profileUrl"
          value={form.profileUrl}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800">Description</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={2}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-800 p-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800">
            Description Width: {form.descriptionWidth}px
          </label>
          <input
            type="range"
            name="descriptionWidth"
            min="60"
            max="300"
            value={form.descriptionWidth}
            onChange={handleChange}
            className="mt-1 block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>60px</span>
            <span>120px</span>
            <span>200px</span>
            <span>300px</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            Description Position
          </label>
          <div className="mt-1 flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="descriptionPosition"
                value="below"
                checked={form.descriptionPosition === 'below'}
                onChange={handleChange}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-800">Below Node</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="descriptionPosition"
                value="right"
                checked={form.descriptionPosition === 'right'}
                onChange={handleChange}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-800">Right of Node</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            Node Size: {form.nodeSize}px
          </label>
          <input
            type="range"
            name="nodeSize"
            min="20"
            max="80"
            value={form.nodeSize}
            onChange={handleChange}
            className="mt-1 block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>20px</span>
            <span>50px</span>
            <span>80px</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800">
            Font Size: {form.labelFontSize}px
          </label>
          <input
            type="range"
            name="labelFontSize"
            min="8"
            max="20"
            value={form.labelFontSize}
            onChange={handleChange}
            className="mt-1 block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>8px</span>
            <span>14px</span>
            <span>20px</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">
          Text Color
        </label>
        <div className="flex items-center">
          <input
            type="color"
            name="labelColor"
            value={form.labelColor}
            onChange={handleChange}
            className="w-10 h-10 border-0 rounded cursor-pointer"
          />
          <span className="ml-2 text-sm text-gray-800">{form.labelColor}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 mt-4">
        {selectedNode && (
          <button
            type="button"
            onClick={() => setSelectedNode(null)}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Cancel Edit
          </button>
        )}
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isUploading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {selectedNode ? 'Update Person' : 'Add Person'}
        </button>
      </div>
    </div>
  );
};

export default NodeEditor;
import { useState, useRef, ChangeEvent, useEffect } from "react";

type PageInfoDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; image: string }) => void;
  initialData?: { title: string; image: string };
  onImageUpload?: (file: File) => Promise<string>;
};

export function PageInfoDialog({
  open,
  onClose,
  onSubmit,
  initialData = { title: "", image: "" },
  onImageUpload,
}: PageInfoDialogProps) {
  const [title, setTitle] = useState(initialData.title);
  const [image, setImage] = useState(initialData.image);
  const [errors, setErrors] = useState({ title: "", image: "" });
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with prop changes
  useEffect(() => {
    setTitle(initialData.title);
    setImage(initialData.image);
    setPreviewImage(null);
    setUploadedImage(null);
    setErrors({ title: "", image: "" });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const validate = () => {
    const newErrors = { title: "", image: "" };
    let isValid = true;

    if (!title.trim()) {
      newErrors.title = "Title is required";
      isValid = false;
    }

    if (image && !/^(https?:\/\/|data:image\/)/.test(image)) {
      newErrors.image = "Please provide a valid image URL or upload an image";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    let finalImage = image;

    if (uploadedImage && !onImageUpload) {
      finalImage = await fileToBase64(uploadedImage);
    }

    onSubmit({ title, image: finalImage });
    handleReset();
  };

  const handleReset = () => {
    setTitle("");
    setImage("");
    setPreviewImage(null);
    setUploadedImage(null);
    setErrors({ title: "", image: "" });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedImage(file);

      const dataUrl = await fileToBase64(file);
      setPreviewImage(dataUrl);

      if (onImageUpload) {
        setIsUploading(true);
        try {
          const imageUrl = await onImageUpload(file);
          setImage(imageUrl);
        } catch (error) {
          setErrors({ ...errors, image: "Upload failed" });
        } finally {
          setIsUploading(false);
        }
      } else {
        setImage("");
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = () => {
    setImage("");
    setPreviewImage(null);
    setUploadedImage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {initialData.title ? "Edit Page" : "Create New Page"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-3 py-2 border ${
                  errors.title ? "border-red-500" : "border-gray-300"
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter page title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title}</p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page Image
              </label>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    className={`flex-grow px-3 py-2 border ${
                      errors.image ? "border-red-500" : "border-gray-300"
                    } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Image URL or upload file"
                  />

                  <button
                    type="button"
                    onClick={triggerFileInput}
                    disabled={isUploading}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 disabled:opacity-50 min-w-[85px]"
                  >
                    {isUploading ? "Uploading..." : "Upload"}
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </div>

                {errors.image && (
                  <p className="text-sm text-red-600">{errors.image}</p>
                )}

                {(previewImage || image) && (
                  <div className="mt-3">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Image Preview
                      </label>
                      <button
                        type="button"
                        onClick={removeImage}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden flex justify-center">
                      <img
                        src={previewImage || image}
                        alt="Preview"
                        className="w-32 h-32 rounded-full object-cover border-4 border-white shadow"
                        onError={(e) => {
                          e.currentTarget.src = "/assets/image-error.svg";
                          e.currentTarget.classList.add("p-4");
                          e.currentTarget.classList.add("bg-gray-100");
                        }}
                      />
                    </div>

                    {previewImage && !onImageUpload && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p className="text-center">
                          Image will be saved as base64
                        </p>
                        <p className="text-center">
                          (Not recommended for large images)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {initialData.title ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

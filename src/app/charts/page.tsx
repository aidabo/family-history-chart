"use client";
import { useDataContext } from "@/context/DataContext";
import { PageProps } from "@/types/charts";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PencilIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { PageInfoDialog } from "@/components/utils/PageInfoDialog";
import { v4 as uuidv4 } from "uuid";

export default function ChartsPage() {
  const [pages, setPages] = useState<PageProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PageProps | null>(null);

  const { loadPageList, updatePage, deletePage, insertPage, uploadImage } =
    useDataContext();

  const navigate = useRouter();

  const handleCreate = () => {
    setEditingPage(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (pageid: string) => {
    const pageToEdit = pages.find((page) => page.id === pageid);
    if (pageToEdit) {
      setEditingPage(pageToEdit);
      setIsDialogOpen(true);
    }
  };

  const handleOpen = (pageid: string) => {
    const pageToEdit = pages.find((page) => page.id === pageid);
    if (pageToEdit) {
      setEditingPage(pageToEdit);
      navigate.push(`/edit/${pageToEdit.id}`);
    }
  };

  const handleDelete = async (pageid: string) => {
    if (window.confirm("Are you sure you want to delete this page?")) {
      try {
        await deletePage(pageid);
        setPages(pages.filter((page) => page.id !== pageid));
      } catch (error) {
        console.error("Failed to delete page:", error);
      }
    }
  };

  const handleView = (pageid: string) => {
    navigate.push(`/view/${pageid}`);
  };

  const handleImageUpload = async (file: File) => {
    try {
      const imageUrl = await uploadImage(file);
      return imageUrl;
    } catch (error) {
      console.error("Image upload failed:", error);
      throw error;
    }
  };

  // Change the handleDialogSubmit function
  const handleDialogSubmit = async (data: { title: string; image: string }) => {
    let pageId = editingPage?.id;

    if (editingPage) {
      setEditingPage((prev:any)=>({
        ...prev,
        title: data.title,
        image: data.image
      }))
      await updatePage(editingPage);
    } else {
      const pageProps: PageProps = {
        id: uuidv4(),
        title: data.title,
        image: data.image,
        options: {},
        chartProps: {
          dynasties: [],
          persons: [],
          relationships: [],
          events: [],
        },
      };
      const newPage = await insertPage(pageProps);
      pageId = newPage?.id;
    }

    // Refresh page list
    const result = await loadPageList();
    if (result !== false) {
      setPages(result);
    }

    setIsDialogOpen(false);

    // Navigate only for new pages
    if (!editingPage && pageId) {
      navigate.push(`/edit/${pageId}`);
    }
  };

  useEffect(() => {
    const fetchPages = async () => {
      if (!loadPageList) return;
      setLoading(true);
      try {
        const result = await loadPageList();
        if (result !== false) {
          setPages(result);
        }
      } catch (error) {
        console.error("Failed to load pages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, []);

  return (
    <>
      <div className="w-full p-4">
        {/* Header Section */}
        <div className="flex justify-end items-center mb-6">
          <h2 className="text-xl font-semibold flex-grow">
            Pages ({pages.length})
          </h2>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Create New Page</span>
          </button>
        </div>

        <hr className="border-gray-300 mb-6" />

        {/* Page List */}
        <div className="bg-gray-50 p-4 rounded-lg">
          {pages.map((page: PageProps) => (
            <div key={page.id} className="mb-4 last:mb-0">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 w-full">
                  <img
                    src={page.image || "/assets/page.svg"}
                    alt={page.title}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="text-sm text-gray-500 w-1/4 truncate">
                    {page.id}
                  </div>
                  <div className="font-medium truncate flex-grow">
                    <div className="flex flex-row items-center">
                      <div>{page.title}</div>
                      <div>
                        <button
                          onClick={() => handleEdit(page.id)}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
                          aria-label="Open"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpen(page.id)}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
                      aria-label="Edit"
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleView(page.id)}
                      className="p-2 text-green-500 hover:bg-green-50 rounded-full"
                      aria-label="View"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(page.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                      aria-label="Delete"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
              <hr className="border-gray-200 mt-4" />
            </div>
          ))}
        </div>
      </div>

      {isDialogOpen && (
        <PageInfoDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSubmit={handleDialogSubmit}
          initialData={(editingPage || undefined) as any}
          onImageUpload={uploadImage ? handleImageUpload : undefined}
        />
      )}
    </>
  );
}

"use client";
import { useDataContext } from "@/context/DataContext";
import DynastyNetwork from "@/components/charts/DynastyNetwork";
import NodeEditor from "@/components/editor/NodeEditor";
import RelationshipForm from "@/components/editor/RelationshipForm";
import ContextMenu from "@/components/ui/ContextMenu";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  TrashIcon,
  CloudArrowDownIcon,
  DocumentIcon,
  EyeIcon,
  ArrowLeftCircleIcon,
} from "@heroicons/react/24/outline";

// Updated TooltipButton component
function TooltipButton({
  onClick,
  icon,
  tooltip,
  className = "",
}: {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  className?: string;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`p-2 rounded-lg transition ${className}`}
      >
        {icon}
      </button>
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
        {tooltip}
        <div className="absolute bottom-full left-1/2 w-2 h-2 bg-black transform -translate-x-1/2 rotate-45 -mb-1"></div>
      </div>
    </div>
  );
}

// Update StatusButton to support icons
function StatusButton({
  onClick,
  icon,
  label,
  className = "",
  successMessage = "Success",
  errorMessage = "Error",
}: {
  onClick: () => Promise<void>;
  icon: React.ReactNode;
  label: string;
  className?: string;
  successMessage?: string;
  errorMessage?: string;
}) {
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      await onClick();
      setStatus({ message: successMessage, type: "success" });
    } catch (error) {
      setStatus({ message: errorMessage, type: "error" });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="relative z-30">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`p-2 rounded-lg transition flex items-center ${className} ${
          isLoading ? "opacity-70" : ""
        }`}
      >
        {isLoading ? (
          <ArrowPathIcon className="h-5 w-5 animate-spin" />
        ) : (
          <>
            {icon}
            <span className="ml-1 hidden sm:inline">{label}</span>
          </>
        )}
      </button>
      {status && (
        <div
          className={`absolute top-full left-0 mt-1 w-full text-center px-2 py-1 rounded-md text-xs font-medium animate-fadeIn ${
            status.type === "success"
              ? "bg-blue-500 text-white"
              : "bg-red-100 text-red-800"
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}

export default function DynastyExplorer() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode"); // 'edit' or 'view'

  const isViewMode = mode === "view";
  const isEditMode = !isViewMode;
  const [showReturnButton, setShowReturnButton] = useState(false);

  const {
    persons,
    relationships,
    selectedNode,
    currentPage,
    loadPage,
    savePage,
    deletePerson,
    deleteRelationship,
    clearPage,
    selectedRelationship,
    setSelectedRelationship,
  } = useDataContext();

  const [editorOpen, setEditorOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(400);
  const [activeTab, setActiveTab] = useState("person");
  const resizeHandleRef = useRef(null);
  const navigate = useRouter();

  useEffect(() => {
    if (isViewMode) {
      // Show return button after a short delay in view mode
      const timer = setTimeout(() => {
        setShowReturnButton(true);
      }, 1000);

      return () => clearTimeout(timer);
    } else {
      setShowReturnButton(false);
    }
  }, [isViewMode]);

  const handleReturnToEdit = () => {
    if (currentPage?.id) {
      const editUrl = `${window.location.origin}/edit/${currentPage.id}`;
      window.location.href = editUrl;
    }
  };

  // Get display relationships - hide partner relationships and show marriage relationships
  const displayRelationships = useMemo(() => {
    const marriageRelationships = new Map();

    // First, find all marriages and map them to their union nodes
    relationships.forEach((rel: any) => {
      if (rel.type === "partner") {
        const unionNode = persons.find(
          (p: any) => p.id === rel.target && p.type === "union"
        );
        if (unionNode) {
          if (!marriageRelationships.has(unionNode.id)) {
            marriageRelationships.set(unionNode.id, {
              id: unionNode.id,
              type: "marriage",
              source: "", // will be filled below
              target: "", // will be filled below
              start: unionNode.marriage?.start || "",
              end: unionNode.marriage?.end || "",
              label: unionNode.marriage?.label || "Marriage",
              partners: [],
            });
          }
          const marriage = marriageRelationships.get(unionNode.id);
          marriage.partners.push(rel.source);
        }
      }
    });

    // Now fill in the source and target for the marriage relationships
    for (const [id, marriage] of marriageRelationships) {
      if (marriage.partners.length === 2) {
        marriage.source = marriage.partners[0];
        marriage.target = marriage.partners[1];
      }
    }

    // Combine non-partner relationships with marriage relationships
    return [
      ...relationships.filter((rel: any) => rel.type !== "partner"),
      ...Array.from(marriageRelationships.values()),
    ];
  }, [relationships, persons]);

  // Load the page when component mounts or pageId changes
  useEffect(() => {
    const load = async () => {
      if (params.id) {
        const pageData = await loadPage(params.id);
        if (!pageData) {
          navigate.push("/charts");
        }
      }
    };
    load();
  }, [params.id]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < 800) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (selectedNode) {
      setActiveTab("person");
    }
  }, [selectedNode]);

  const handlePreview = () => {
    if (currentPage?.id) {
      const previewUrl = `${window.location.origin}/edit/${currentPage.id}/?mode=view`;
      window.open(previewUrl, "_blank");
    } else {
      alert("No page to preview. Please save the page first.");
    }
  };

  const handleSave = async () => {
    const page = await savePage();
    if (page) {
    } else {
      alert("save failed");
    }
  };

  const handleReload = useCallback(async () => {
    if (params.id) {
      const pageData = await loadPage(params.id);
      if (!pageData) {
        navigate.push("/charts");
      }
    }
  }, [loadPage]);

  const handleClear = () => {
    if (
      confirm("Are you sure you want to clear all data? This cannot be undone.")
    ) {
      // Implement clear functionality
      if (currentPage) {
        clearPage();
      }
      console.log("Clearing all data");
    }
  };

  const handleImportCSV = () => {
    // Implement CSV import functionality
    console.log("Importing CSV");
  };

  const handleBackToList = () => {
    navigate.push("/charts");
  };

  const handleChangeRelationship = (rel: any) => {
    // If it's a marriage relationship, create a mock relationship with the two partners
    if (rel.type === "marriage") {
      const unionNode = persons.find(
        (p) => p.id === rel.id && p.type === "union"
      );
      const partnerRels = relationships.filter(
        (r: any) => r.type === "partner" && r.target === rel.id
      );

      if (partnerRels.length === 2 && unionNode) {
        setSelectedRelationship({
          id: unionNode.id,
          source: partnerRels[0].source,
          target: partnerRels[1].source,
          type: "marriage",
          start: unionNode.marriage?.start || "",
          end: unionNode.marriage?.end || "",
          label: unionNode.marriage?.label || "Marriage",
        });
        console.log("relationship:*******", selectedRelationship);
        setActiveTab("relationship");
      }
    } else {
      // For other relationships, just pass it directly
      setSelectedRelationship(rel);
      setActiveTab("relationship");
    }
  };

  // Handle removing a relationship
  const handleRemoveRelationship = (rel: any) => {
    if (rel.type === "marriage") {
      // For marriage, we need to delete the union node which will delete both partner relationships
      deletePerson(rel.id);
    } else {
      // For other relationships, just delete the relationship
      deleteRelationship(rel.id);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/*header*/}

      {isEditMode && (
        <header className="p-4 bg-white shadow relative">
          <div className="flex flex-col sm:flex-row sm:items-center">
            {/* Title and Description - Always full width */}
            <div className="flex-1 mb-3 sm:mb-0">
              <h1 className="text-2xl font-bold">
                {currentPage?.title || "Family Timeline"}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {currentPage?.description}
              </p>
            </div>

            {/* Button Group - Full width on mobile, auto width on desktop */}
            <div className="flex flex-wrap gap-1 justify-end pr-4">
              {/* Back to List */}
              <TooltipButton
                onClick={handleBackToList}
                icon={<ArrowLeftIcon className="h-5 w-5" />}
                tooltip="Back to list"
                className="bg-gray-200 hover:bg-gray-300"
              />

              {/* Preview */}
              <TooltipButton
                onClick={handlePreview}
                icon={<EyeIcon className="h-5 w-5" />}
                tooltip="Preview"
                className="bg-purple-600 hover:bg-purple-700 text-white"
              />

              {/* Save */}
              <StatusButton
                onClick={handleSave}
                icon={<CloudArrowDownIcon className="h-5 w-5" />}
                label="Save"
                className="bg-green-600 hover:bg-green-700 text-white"
                successMessage="Saved successfully!"
                errorMessage="Save failed"
              />

              {/* Reload */}
              <StatusButton
                onClick={handleReload}
                icon={<ArrowPathIcon className="h-5 w-5" />}
                label="Reload"
                className="bg-green-600 hover:bg-green-700 text-white"
                successMessage="Reloaded successfully"
                errorMessage="Failed to reload"
              />

              {/* Clear */}
              <TooltipButton
                onClick={handleClear}
                icon={<TrashIcon className="h-5 w-5" />}
                tooltip="Clear all data"
                className="bg-red-600 hover:bg-red-700 text-white"
              />

              {/* Import CSV */}
              <TooltipButton
                onClick={handleImportCSV}
                icon={<DocumentArrowDownIcon className="h-5 w-5" />}
                tooltip="Import CSV"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              />

              {/* Export PDF */}
              <TooltipButton
                onClick={() => window.print()}
                icon={<DocumentIcon className="h-5 w-5" />}
                tooltip="Export PDF"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              />

              {/* Toggle Editor */}
              <TooltipButton
                onClick={() => setEditorOpen(!editorOpen)}
                icon={
                  editorOpen ? (
                    <ChevronRightIcon className="h-5 w-5" />
                  ) : (
                    <ChevronLeftIcon className="h-5 w-5" />
                  )
                }
                tooltip={editorOpen ? "Hide Editor" : "Show Editor"}
                className="bg-gray-200 hover:bg-gray-300"
              />
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area - Flex container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div
          className={`flex-1 transition-all duration-200 ${
            editorOpen ? "overflow-auto" : "overflow-hidden"
          }`}
        >
          <div className="p-4 h-full">
            <div className="bg-white rounded-lg shadow h-full flex flex-col">
              <div className="flex-1 relative">
                <DynastyNetwork />
              </div>
            </div>
          </div>
        </div>

        {/* Editor Panel - Flex item on the right */}
        {isEditMode && editorOpen && (
          <div
            className="relative flex flex-col h-full bg-white shadow-lg border-l border-gray-200"
            style={{ width: `${panelWidth}px`, minWidth: "300px" }}
          >
            <div
              ref={resizeHandleRef}
              className="absolute left-0 top-0 bottom-0 w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
              onMouseDown={() => setIsResizing(true)}
            />

            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab("person")}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${
                    activeTab === "person"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  Person Editor
                </button>
                <button
                  onClick={() => setActiveTab("relationship")}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${
                    activeTab === "relationship"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  Relationship Editor
                </button>
              </div>
              <button
                onClick={() => setEditorOpen(false)}
                className="text-gray-700 hover:text-gray-900"
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

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "person" ? (
                <div className="space-y-4">
                  <NodeEditor />

                  {selectedNode && (
                    <div className="mt-6 pt-4 border-t">
                      <h3 className="text-lg font-medium mb-3">
                        Relationships
                      </h3>
                      <div className="space-y-3">
                        <div className="text-sm">
                          <p className="font-medium">
                            Connected relationships:
                          </p>
                          <ul className="mt-2 space-y-1">
                            {displayRelationships
                              .filter(
                                (rel: any) =>
                                  rel.source === selectedNode.id ||
                                  rel.target === selectedNode.id
                              )
                              .map((rel: any) => {
                                const otherPersonId =
                                  rel.source === selectedNode.id
                                    ? rel.target
                                    : rel.source;

                                const otherPerson = persons.find(
                                  (p: any) => p.id === otherPersonId
                                );

                                //maybe union with child relation of marriage
                                //if (otherPerson?.type === 'union') return null;

                                return (
                                  <li
                                    key={rel.id}
                                    className="flex justify-between items-center py-1 border-b border-gray-100"
                                  >
                                    <div>
                                      <span className="font-medium">
                                        {rel.label ||
                                          (rel.type === "marriage"
                                            ? "Married to"
                                            : rel.type === "parent-child"
                                            ? "Parent/Child: "
                                            : rel.type)}
                                      </span>{" "}
                                      {otherPerson?.name || "Unknown"}
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() =>
                                          handleChangeRelationship(rel)
                                        }
                                        className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50"
                                      >
                                        Change
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleRemoveRelationship(rel)
                                        }
                                        className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            {displayRelationships.filter(
                              (rel: any) =>
                                (rel.source === selectedNode.id ||
                                  rel.target === selectedNode.id) &&
                                persons.find(
                                  (p: any) =>
                                    p.id ===
                                    (rel.source === selectedNode.id
                                      ? rel.target
                                      : rel.source)
                                )?.type !== "union"
                            ).length === 0 && (
                              <li className="text-gray-500 italic py-2">
                                No relationships
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <RelationshipForm
                  onClose={() => setActiveTab("person")}
                  relationship={selectedRelationship}
                />
              )}
            </div>
          </div>
        )}
      </div>
      {isEditMode && (
        <ContextMenu
          onDeletePerson={deletePerson}
          onDeleteRelationship={deleteRelationship}
        />
      )}

      {isViewMode && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div
            className={`absolute bottom-8 right-8 pointer-events-auto transition-all duration-500 ${
              showReturnButton
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <button
              onClick={handleReturnToEdit}
              className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-300 transform hover:scale-105 group"
              title="Return to Edit Mode"
            >
              <ArrowLeftCircleIcon className="h-6 w-6 group-hover:animate-bounce" />
              <span className="text-sm font-medium">Edit Mode</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

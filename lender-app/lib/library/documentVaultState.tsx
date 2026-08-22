"use client";



import React, {

  createContext,

  useCallback,

  useContext,

  useMemo,

  useState,

  type ReactNode,

} from "react";

import type { Id } from "@/convex/_generated/dataModel";

import type {

  VaultCategoryFilter,

  VaultTaxYearFilter,

} from "@/lib/library/documentVaultTaxonomy";



export type DocumentVaultNavigationState = {

  currentFolderId: Id<"documentFolders"> | null;

  selectedDocumentId: Id<"libraryDocuments"> | null;

  activeCategoryFilter: VaultCategoryFilter;

  activeTaxYearFilter: VaultTaxYearFilter;

  highlightDocumentId: Id<"libraryDocuments"> | null;

  isModalOpen: boolean;

  propertiesDocumentId: Id<"libraryDocuments"> | null;

};



export type DocumentVaultNavigationActions = {

  setCurrentFolderId: (id: Id<"documentFolders"> | null) => void;

  setSelectedDocumentId: (id: Id<"libraryDocuments"> | null) => void;

  setActiveCategoryFilter: (filter: VaultCategoryFilter) => void;

  setActiveTaxYearFilter: (filter: VaultTaxYearFilter) => void;

  setHighlightDocumentId: (id: Id<"libraryDocuments"> | null) => void;

  setIsModalOpen: (value: boolean) => void;

  setPropertiesDocumentId: (id: Id<"libraryDocuments"> | null) => void;

  navigateToFolder: (

    id: Id<"documentFolders"> | null,

    options?: { keepPreview?: boolean },

  ) => void;

  selectDocument: (id: Id<"libraryDocuments"> | null) => void;

  closePreview: () => void;

  openProperties: (id: Id<"libraryDocuments">) => void;

  closeProperties: () => void;

};



export type DocumentVaultStateValue = DocumentVaultNavigationState &

  DocumentVaultNavigationActions;



const DocumentVaultStateContext = createContext<DocumentVaultStateValue | null>(

  null,

);



export function DocumentVaultStateProvider({ children }: { children: ReactNode }) {

  const [currentFolderId, setCurrentFolderId] =

    useState<Id<"documentFolders"> | null>(null);

  const [selectedDocumentId, setSelectedDocumentId] =

    useState<Id<"libraryDocuments"> | null>(null);

  const [activeCategoryFilter, setActiveCategoryFilter] =

    useState<VaultCategoryFilter>("all");

  const [activeTaxYearFilter, setActiveTaxYearFilter] =

    useState<VaultTaxYearFilter>("all");

  const [highlightDocumentId, setHighlightDocumentId] =

    useState<Id<"libraryDocuments"> | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [propertiesDocumentId, setPropertiesDocumentId] =

    useState<Id<"libraryDocuments"> | null>(null);



  const navigateToFolder = useCallback(

    (id: Id<"documentFolders"> | null, options?: { keepPreview?: boolean }) => {

      setCurrentFolderId(id);

      if (!options?.keepPreview) {

        setSelectedDocumentId(null);

        setIsModalOpen(false);

      }

    },

    [],

  );



  const selectDocument = useCallback((id: Id<"libraryDocuments"> | null) => {

    setSelectedDocumentId(id);

    if (id) {

      setPropertiesDocumentId(null);

      setIsModalOpen(true);

    } else {

      setIsModalOpen(false);

    }

  }, []);



  const closePreview = useCallback(() => {

    setSelectedDocumentId(null);

    setIsModalOpen(false);

  }, []);



  const openProperties = useCallback((id: Id<"libraryDocuments">) => {

    setPropertiesDocumentId(id);

  }, []);



  const closeProperties = useCallback(() => {

    setPropertiesDocumentId(null);

  }, []);



  const value = useMemo(

    (): DocumentVaultStateValue => ({

      currentFolderId,

      selectedDocumentId,

      activeCategoryFilter,

      activeTaxYearFilter,

      highlightDocumentId,

      isModalOpen,

      propertiesDocumentId,

      setCurrentFolderId,

      setSelectedDocumentId,

      setActiveCategoryFilter,

      setActiveTaxYearFilter,

      setHighlightDocumentId,

      setIsModalOpen,

      setPropertiesDocumentId,

      navigateToFolder,

      selectDocument,

      closePreview,

      openProperties,

      closeProperties,

    }),

    [

      currentFolderId,

      selectedDocumentId,

      activeCategoryFilter,

      activeTaxYearFilter,

      highlightDocumentId,

      isModalOpen,

      propertiesDocumentId,

      navigateToFolder,

      selectDocument,

      closePreview,

      openProperties,

      closeProperties,

    ],

  );



  return (

    <DocumentVaultStateContext.Provider value={value}>

      {children}

    </DocumentVaultStateContext.Provider>

  );

}



export function useDocumentVaultState(): DocumentVaultStateValue {

  const ctx = useContext(DocumentVaultStateContext);

  if (!ctx) {

    throw new Error(

      "useDocumentVaultState must be used within DocumentVaultStateProvider",

    );

  }

  return ctx;

}



export function useDocumentVaultStateOptional(): DocumentVaultStateValue | null {

  return useContext(DocumentVaultStateContext);

}



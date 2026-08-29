import { useEffect, useState } from "react";
import { sectionHeadings, type SectionId } from "../lib/appNavigation";

const sectionPaths: Record<SectionId, string> = {
  home: "/", marketplace: "/marketplace", helpers: "/agents", creator: "/creator",
  moderation: "/moderation", operations: "/operations", vault: "/private-info", clearance: "/access",
  activity: "/activity", settings: "/settings"
};

function sectionFromLocation(fallback: SectionId) {
  const match = (Object.entries(sectionPaths) as Array<[SectionId, string]>).find(([, path]) => path === window.location.pathname);
  return match?.[0] ?? fallback;
}

export function useAppNavigation(initialSection: SectionId = "home") {
  const [activeSection, setActiveSectionState] = useState<SectionId>(() => sectionFromLocation(initialSection));
  const heading = sectionHeadings[activeSection];

  useEffect(() => {
    const handlePopState = () => setActiveSectionState(sectionFromLocation(initialSection));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialSection]);

  function setActiveSection(id: SectionId) {
    setActiveSectionState(id);
    if (window.location.pathname !== sectionPaths[id]) window.history.pushState({ section: id }, "", sectionPaths[id]);
  }

  function sectionClass(section: SectionId) {
    return activeSection === section ? "is-section-active" : "";
  }

  function activeMobileClass(section: SectionId) {
    return activeSection === section ? "is-mobile-active" : "";
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }

  return {
    activeSection,
    setActiveSection,
    heading,
    sectionClass,
    activeMobileClass,
    scrollToSection
  };
}

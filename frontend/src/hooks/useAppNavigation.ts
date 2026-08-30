import { useEffect, useState } from "react";
import { sectionHeadings, type SectionId } from "../lib/appNavigation";
import { pathForSection, sectionFromPathname } from "../lib/appRoutes";

function sectionFromLocation(fallback: SectionId) {
  return sectionFromPathname(window.location.pathname, fallback);
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
    const path = pathForSection(id);
    if (window.location.pathname !== path) window.history.pushState({ section: id }, "", path);
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

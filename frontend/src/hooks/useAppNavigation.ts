import { useState } from "react";
import { sectionHeadings, type SectionId } from "../lib/appNavigation";

export function useAppNavigation(initialSection: SectionId = "home") {
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);
  const heading = sectionHeadings[activeSection];

  function sectionClass(section: SectionId) {
    return activeSection === section ? "is-section-active" : "";
  }

  function activeMobileClass(section: SectionId) {
    return activeSection === section ? "is-mobile-active" : "";
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
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

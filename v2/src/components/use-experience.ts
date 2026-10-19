"use client";
import { useEffect, useState } from "react";
import { resolveExperience, type Experience } from "../lib/experience";
export function useExperience() {
  const [experience, setExperience] = useState<Experience | null>(null);
  useEffect(
    () =>
      setExperience(
        resolveExperience({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
          mobile: (
            navigator as Navigator & { userAgentData?: { mobile: boolean } }
          ).userAgentData?.mobile,
        }),
      ),
    [],
  );
  return experience;
}

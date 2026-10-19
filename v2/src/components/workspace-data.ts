"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useRead<T = any>(path: string | null, revision = 0) {
  const version = useRef(0),
    currentPath = useRef(path);
  currentPath.current = path;
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: string;
  }>({ key: null, data: null, error: "" });
  const refresh = useCallback(async () => {
    if (!path) return;
    const request = ++version.current;
    setState((old) =>
      old.key === path
        ? { ...old, error: "" }
        : { key: path, data: null, error: "" },
    );
    try {
      const data: T = await api(path);
      if (version.current === request && currentPath.current === path)
        setState({ key: path, data, error: "" });
      return data;
    } catch (error) {
      if (version.current === request && currentPath.current === path)
        setState({
          key: path,
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load this workspace.",
        });
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    return () => {
      version.current++;
    };
  }, [refresh, revision]);
  return {
    data: state.key === path ? state.data : null,
    error: state.key === path ? state.error : "",
    refresh,
  };
}

import { useCallback, useState } from 'react';

/** 右侧抽屉滑入/滑出时长（与 transform / opacity 一致） */
export const DRAWER_MS = 320;

export function useRightDrawer() {
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelEnter, setPanelEnter] = useState(false);

  const openPanel = useCallback(() => {
    setPanelMounted(true);
    setPanelEnter(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelEnter(true));
    });
  }, []);

  const closePanel = useCallback(() => {
    setPanelEnter(false);
  }, []);

  const onPanelTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return;
    if (!panelEnter) setPanelMounted(false);
  }, [panelEnter]);

  /** 顶栏图标：未打开则打开，已打开则开始关闭 */
  const toggleFromTrigger = useCallback(() => {
    if (!panelMounted) openPanel();
    else if (panelEnter) closePanel();
  }, [panelMounted, panelEnter, openPanel, closePanel]);

  return {
    panelMounted,
    panelEnter,
    openPanel,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  };
}

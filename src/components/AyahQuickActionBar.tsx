import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpenText,
  Check,
  ClipboardPlus,
  Loader2,
  Pause,
  Play,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import { toArabicDigits } from '../utils/mushafData';

export interface AyahQuickActionTarget {
  surahId: number;
  ayahNum: number;
}

interface AyahQuickActionBarProps {
  target: AyahQuickActionTarget | null;
  pageBodyRef: React.RefObject<HTMLDivElement | null>;
  surahName: string;
  activeAudioTarget: AyahQuickActionTarget | null;
  isAudioPlaying: boolean;
  isAudioLoading: boolean;
  isSingleAudioMode: boolean;
  isAyahInReport?: boolean;
  onPlaySingleAyah: (surahId: number, ayahNum: number) => void;
  onPlayFromHere: (surahId: number, ayahNum: number) => void;
  onOpenAudioSettings: (surahId: number, ayahNum: number) => void;
  onOpenTafsir: (surahId: number, ayahNum: number) => void;
  onSendToReport?: (surahId: number, ayahNum: number) => Promise<'added' | 'updated' | null>;
  onClose: () => void;
}

export const AyahQuickActionBar: React.FC<AyahQuickActionBarProps> = ({
  target,
  pageBodyRef,
  surahName,
  activeAudioTarget,
  isAudioPlaying,
  isAudioLoading,
  isSingleAudioMode,
  isAyahInReport = false,
  onPlaySingleAyah,
  onPlayFromHere,
  onOpenAudioSettings,
  onOpenTafsir,
  onSendToReport,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });
  const [isSendingToReport, setIsSendingToReport] = useState(false);
  const [sentToReportState, setSentToReportState] = useState<'added' | 'updated' | null>(null);

  useEffect(() => {
    setSentToReportState(null);
    setIsSendingToReport(false);
  }, [target?.surahId, target?.ayahNum]);

  const updatePosition = useCallback(() => {
    if (!target || typeof window === 'undefined') return;
    const popEl = popoverRef.current;
    const bodyEl = pageBodyRef.current;
    const vv = window.visualViewport;
    const vw = vv ? vv.width : document.documentElement.clientWidth || window.innerWidth;
    const vh = vv ? vv.height : document.documentElement.clientHeight || window.innerHeight;
    const offsetLeft = vv ? vv.offsetLeft : 0;
    const offsetTop = vv ? vv.offsetTop : 0;

    const popW = popEl?.offsetWidth || Math.min(410, vw - 24);
    const popH = popEl?.offsetHeight || 98;
    const marginX = 12;
    const marginTop = 14;
    const marginBottom = 20;

    const key = `${target.surahId}:${target.ayahNum}`;
    const nodes = bodyEl
      ? Array.from(bodyEl.querySelectorAll<HTMLElement>(`[data-ayah-key="${key}"]`))
      : [];

    let anchorCenterX = offsetLeft + vw * 0.5;
    let anchorMinTop = offsetTop + vh * 0.5;
    let anchorMaxBottom = offsetTop + vh * 0.5;
    let hasAnchor = false;

    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!hasAnchor) {
        anchorMinTop = rect.top;
        anchorMaxBottom = rect.bottom;
        anchorCenterX = (rect.left + rect.right) * 0.5;
        hasAnchor = true;
      } else {
        const minL = Math.min(anchorCenterX, rect.left);
        const maxR = Math.max(anchorCenterX, rect.right);
        anchorCenterX = (minL + maxR) * 0.5;
        if (rect.top < anchorMinTop) anchorMinTop = rect.top;
        if (rect.bottom > anchorMaxBottom) anchorMaxBottom = rect.bottom;
      }
    }

    if (hasAnchor && nodes.length > 0) {
      let minL = Infinity;
      let maxR = -Infinity;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.left < minL) minL = rect.left;
        if (rect.right > maxR) maxR = rect.right;
      }
      if (Number.isFinite(minL) && Number.isFinite(maxR)) {
        anchorCenterX = (minL + maxR) * 0.5;
      }
    }

    const minLeft = offsetLeft + marginX;
    const maxLeft = Math.max(minLeft, offsetLeft + vw - popW - marginX);
    const left = Math.max(minLeft, Math.min(maxLeft, anchorCenterX - popW * 0.5));

    const gap = 12;
    let top = anchorMinTop - popH - gap;
    if (top < offsetTop + marginTop) {
      const belowTop = anchorMaxBottom + gap;
      if (belowTop + popH <= offsetTop + vh - marginBottom) {
        top = belowTop;
      } else {
        top = Math.max(offsetTop + marginTop, offsetTop + vh - popH - marginBottom);
      }
    }

    setCoords({ left: Math.round(left), top: Math.round(top), ready: true });
  }, [target, pageBodyRef]);

  useLayoutEffect(() => {
    if (!target) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updatePosition, { passive: true });
    vv?.addEventListener('scroll', updatePosition, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, { capture: true });
      vv?.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
    };
  }, [target, updatePosition]);

  useEffect(() => {
    if (!target) return;

    const handlePointerDown = (e: PointerEvent) => {
      const popEl = popoverRef.current;
      const eventTarget = e.target as HTMLElement | null;
      if (!popEl) return;
      if (popEl.contains(eventTarget)) return;
      // Let clicking another ayah word/rosette smoothly switch or toggle cleanly
      if (eventTarget?.closest('.mushaf-word-btn, .ayah-num, [data-ayah-key]')) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [target, onClose]);

  if (!target || typeof document === 'undefined') return null;

  const isThisAyahActive = Boolean(
    activeAudioTarget &&
      activeAudioTarget.surahId === target.surahId &&
      activeAudioTarget.ayahNum === target.ayahNum
  );
  const isSinglePlaying = Boolean(isThisAyahActive && isSingleAudioMode && isAudioPlaying);
  const isSingleLoading = Boolean(isThisAyahActive && isSingleAudioMode && isAudioLoading);
  const isStreamPlaying = Boolean(isThisAyahActive && !isSingleAudioMode && isAudioPlaying);
  const isStreamLoading = Boolean(isThisAyahActive && !isSingleAudioMode && isAudioLoading);

  return createPortal(
    <div
      ref={popoverRef}
      className={`ayah-quick-popover ${coords.ready ? 'is-ready' : ''}`}
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
      }}
      role="dialog"
      aria-label={`خيارات سورة ${surahName} الآية ${toArabicDigits(target.ayahNum)}`}
      dir="rtl"
      data-annotation-ui="true"
    >
      <div className="ayah-quick-popover-head">
        <span className="ayah-quick-popover-title">
          سورة {surahName} · الآية {toArabicDigits(target.ayahNum)}
        </span>
        <button
          type="button"
          className="ayah-quick-close-btn"
          onClick={onClose}
          aria-label="إغلاق خيارات الآية"
          title="إغلاق"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.2} />
        </button>
      </div>

      <div className="ayah-quick-popover-actions">
        <button
          type="button"
          className={`ayah-quick-btn ${isSinglePlaying ? 'is-active' : ''}`}
          onClick={() => {
            onPlaySingleAyah(target.surahId, target.ayahNum);
            if (!isSinglePlaying) onClose();
          }}
          title={isSinglePlaying ? 'إيقاف تلاوة الآية' : 'استماع لهذه الآية فقط'}
        >
          {isSingleLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
          ) : isSinglePlaying ? (
            <Pause className="w-3.5 h-3.5 shrink-0" fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="w-3.5 h-3.5 shrink-0" fill="currentColor" aria-hidden="true" />
          )}
          <span>{isSinglePlaying ? 'إيقاف' : 'الآية فقط'}</span>
        </button>

        <button
          type="button"
          className={`ayah-quick-btn ${isStreamPlaying ? 'is-active' : ''}`}
          onClick={() => {
            onPlayFromHere(target.surahId, target.ayahNum);
            if (!isStreamPlaying) onClose();
          }}
          title={isStreamPlaying ? 'إيقاف التلاوة المتصلة' : 'تشغيل التلاوة المتصلة من هذه الآية'}
        >
          {isStreamLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
          ) : isStreamPlaying ? (
            <Pause className="w-3.5 h-3.5 shrink-0" fill="currentColor" aria-hidden="true" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{isStreamPlaying ? 'إيقاف' : 'من هنا'}</span>
        </button>

        <button
          type="button"
          className="ayah-quick-btn"
          onClick={() => {
            onClose();
            onOpenAudioSettings(target.surahId, target.ayahNum);
          }}
          title="التحكم في التلاوة وتحديد مقطع"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>الصوت</span>
        </button>

        <button
          type="button"
          className="ayah-quick-btn is-tafsir"
          onClick={() => {
            onClose();
            onOpenTafsir(target.surahId, target.ayahNum);
          }}
          title="عرض تفسير الآية"
        >
          <BookOpenText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>التفسير</span>
        </button>

        {onSendToReport && (
          <button
            type="button"
            className={`ayah-quick-btn is-report ${
              sentToReportState || isAyahInReport ? 'is-active' : ''
            }`}
            disabled={isSendingToReport}
            onClick={async () => {
              if (!target || isSendingToReport) return;
              setIsSendingToReport(true);
              try {
                const res = await onSendToReport(target.surahId, target.ayahNum);
                if (res) {
                  setSentToReportState(res);
                  window.setTimeout(() => setSentToReportState(null), 1800);
                }
              } finally {
                setIsSendingToReport(false);
              }
            }}
            title="التقاط هذه الآية وإرسالها إلى تقرير الحصة"
          >
            {isSendingToReport ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
            ) : sentToReportState ? (
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ClipboardPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {sentToReportState === 'updated'
                ? 'تم التحديث'
                : sentToReportState === 'added'
                ? 'تم الإرسال'
                : isAyahInReport
                ? 'تحديث'
                : 'للتقرير'}
            </span>
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

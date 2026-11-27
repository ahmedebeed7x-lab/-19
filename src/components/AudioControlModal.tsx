import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  TOTAL_MUSHAF_PAGES,
  toArabicDigits,
  type MushafDataset,
  type MushafSurahMeta,
} from '../utils/mushafData';
import {
  AUDIO_PAUSE_GAP_OPTIONS,
  AYAH_REPEAT_OPTIONS,
  PLAYBACK_RATE_OPTIONS,
  QURAN_RECITERS,
  compareAyahRefs,
  computeAyahRangeEnd,
  countAyahsBetween,
  findMushafPageForAyah,
  getJozzAyahSpan,
  getPageAyahSpan,
  type AudioPauseGap,
  type PlaybackRateOption,
  type ReciterId,
} from '../utils/quranAudio';

export interface AudioControlTarget {
  surahId: number;
  ayahNum: number;
}

export interface AudioControlApplyPayload {
  surahId: number;
  ayahNum: number;
  reciterId: ReciterId;
  rate: PlaybackRateOption;
  repeat: number;
  repeatSection: boolean;
  ayahCount: number;
  autoFollow: boolean;
  pauseGap: AudioPauseGap;
  stopAtPageEnd: boolean;
}

type AudioScopeType = 'ayah' | 'page' | 'jozz' | 'surah';
type AudioRangeMode = 'continuous' | 'range' | 'single';

interface AudioControlModalProps {
  target: AudioControlTarget | null;
  onClose: () => void;
  surahMetaMap: Map<number, MushafSurahMeta>;
  mushafDataset: MushafDataset | null;
  currentPageSurahId?: number;
  currentPageNum?: number;
  currentJozz?: number;
  reciterId: ReciterId;
  rate: PlaybackRateOption;
  repeat: number;
  repeatSection: boolean;
  ayahCount: number;
  autoFollow: boolean;
  pauseGap: AudioPauseGap;
  stopAtPageEnd: boolean;
  activeSessionTotal?: number;
  activeSessionRepeatSection?: boolean;
  activeAudioTarget: AudioControlTarget | null;
  isPlaying: boolean;
  isLoading: boolean;
  onStartPlayback: (payload: AudioControlApplyPayload) => void;
  onPausePlayback: () => void;
  onStopPlayback?: () => void;
}

export const AudioControlModal: React.FC<AudioControlModalProps> = ({
  target,
  onClose,
  surahMetaMap,
  mushafDataset,
  currentPageSurahId,
  currentPageNum,
  currentJozz,
  reciterId,
  rate,
  repeat,
  repeatSection,
  ayahCount,
  autoFollow,
  pauseGap,
  stopAtPageEnd,
  activeSessionTotal,
  activeSessionRepeatSection,
  activeAudioTarget,
  isPlaying,
  isLoading,
  onStartPlayback,
  onPausePlayback,
  onStopPlayback,
}) => {
  const modalCardRef = useRef<HTMLFormElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [scopeType, setScopeType] = useState<AudioScopeType>('ayah');
  const [rangeMode, setRangeMode] = useState<AudioRangeMode>('single');

  // Ayah scope state
  const [fromSurahId, setFromSurahId] = useState<number>(target?.surahId ?? 1);
  const [fromAyah, setFromAyah] = useState<number>(target?.ayahNum ?? 1);
  const [toSurahId, setToSurahId] = useState<number>(target?.surahId ?? 1);
  const [toAyah, setToAyah] = useState<number>(target?.ayahNum ?? 1);

  // Page scope state
  const [fromPage, setFromPage] = useState<number>(currentPageNum ?? 1);
  const [toPage, setToPage] = useState<number>(currentPageNum ?? 1);

  // Jozz scope state
  const [fromJozz, setFromJozz] = useState<number>(currentJozz ?? 1);
  const [toJozz, setToJozz] = useState<number>(currentJozz ?? 1);

  // Surah scope state
  const [fromRangeSurahId, setFromRangeSurahId] = useState<number>(target?.surahId ?? 1);
  const [toRangeSurahId, setToRangeSurahId] = useState<number>(target?.surahId ?? 1);

  // Unified playback control drafts
  const [reciterDraft, setReciterDraft] = useState<ReciterId>(reciterId);
  const [rateDraft, setRateDraft] = useState<PlaybackRateOption>(rate);
  const [repeatDraft, setRepeatDraft] = useState<number>(repeat);
  const [pauseGapDraft, setPauseGapDraft] = useState<AudioPauseGap>(pauseGap);
  const [autoFollowDraft, setAutoFollowDraft] = useState<boolean>(autoFollow);
  const [stopAtPageEndDraft, setStopAtPageEndDraft] = useState<boolean>(stopAtPageEnd);
  const [repeatSectionDraft, setRepeatSectionDraft] = useState<boolean>(repeatSection);

  const orderedSurahs = useMemo(
    () => Array.from(surahMetaMap.values()).sort((a, b) => a.id - b.id),
    [surahMetaMap]
  );

  const pageNumbers = useMemo(
    () => Array.from({ length: TOTAL_MUSHAF_PAGES }, (_, i) => i + 1),
    []
  );

  const jozzNumbers = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);

  const teachingReciters = useMemo(
    () => QURAN_RECITERS.filter((r) => r.id === 'Husary_Muallim_128kbps'),
    []
  );
  const murattalReciters = useMemo(
    () => QURAN_RECITERS.filter((r) => r.id !== 'Husary_Muallim_128kbps'),
    []
  );

  useEffect(() => {
    if (!target) return;
    const meta = surahMetaMap.get(target.surahId);
    const total = meta?.totalAyat ?? 7;
    const clampedFromAyah = Math.max(1, Math.min(total, target.ayahNum));

    const effectiveCount =
      activeAudioTarget &&
      activeAudioTarget.surahId === target.surahId &&
      activeAudioTarget.ayahNum === clampedFromAyah &&
      activeSessionTotal !== undefined
        ? activeSessionTotal
        : ayahCount;

    const targetPage =
      findMushafPageForAyah(mushafDataset, target.surahId, clampedFromAyah) ??
      currentPageNum ??
      1;
    const targetJozz = mushafDataset?.pages[targetPage - 1]?.j ?? currentJozz ?? 1;

    if (stopAtPageEnd) {
      setScopeType('page');
      setRangeMode('single');
    } else {
      const initialMode: AudioRangeMode =
        effectiveCount === 0 ? 'continuous' : effectiveCount > 1 ? 'range' : 'single';
      setScopeType('ayah');
      setRangeMode(initialMode);
    }

    const endInfo =
      effectiveCount > 1
        ? computeAyahRangeEnd(target.surahId, clampedFromAyah, effectiveCount, surahMetaMap)
        : { end: { surahId: target.surahId, ayahNum: clampedFromAyah }, actualCount: 1 };

    setFromSurahId(target.surahId);
    setFromAyah(clampedFromAyah);
    setToSurahId(endInfo.end.surahId);
    setToAyah(endInfo.end.ayahNum);

    setFromPage(targetPage);
    setToPage(targetPage);

    setFromJozz(targetJozz);
    setToJozz(targetJozz);

    setFromRangeSurahId(target.surahId);
    setToRangeSurahId(target.surahId);

    setReciterDraft(reciterId);
    setRateDraft(rate);
    setRepeatDraft(repeat);
    setPauseGapDraft(pauseGap);
    setAutoFollowDraft(autoFollow);
    setStopAtPageEndDraft(stopAtPageEnd);
    setRepeatSectionDraft(
      effectiveCount === 0 ? false : activeSessionRepeatSection ?? repeatSection
    );
  }, [
    target,
    surahMetaMap,
    mushafDataset,
    currentPageNum,
    currentJozz,
    reciterId,
    rate,
    repeat,
    pauseGap,
    autoFollow,
    stopAtPageEnd,
    repeatSection,
    ayahCount,
    activeSessionTotal,
    activeSessionRepeatSection,
    activeAudioTarget,
  ]);

  const isOpen = Boolean(target);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalCardRef.current?.focus({ preventScroll: true });
    return () => {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  const fromSurahTotal = surahMetaMap.get(fromSurahId)?.totalAyat ?? 7;
  const toSurahTotal = surahMetaMap.get(toSurahId)?.totalAyat ?? 7;

  const fromAyahOptions = useMemo(
    () => Array.from({ length: fromSurahTotal }, (_, i) => i + 1),
    [fromSurahTotal]
  );

  const toAyahOptions = useMemo(() => {
    const minAyah = toSurahId === fromSurahId ? fromAyah : 1;
    const len = Math.max(1, toSurahTotal - minAyah + 1);
    return Array.from({ length: len }, (_, i) => minAyah + i);
  }, [toSurahId, fromSurahId, fromAyah, toSurahTotal]);

  const resolvedSelection = useMemo(() => {
    if (scopeType === 'ayah') {
      const start = { surahId: fromSurahId, ayahNum: fromAyah };
      if (rangeMode === 'continuous') {
        return { start, count: 0 };
      }
      if (rangeMode === 'single') {
        return { start, count: 1 };
      }
      const end = { surahId: toSurahId, ayahNum: toAyah };
      return {
        start,
        count: countAyahsBetween(start, end, surahMetaMap),
      };
    }

    if (scopeType === 'page') {
      const span = getPageAyahSpan(
        mushafDataset,
        fromPage,
        rangeMode === 'range' ? toPage : fromPage,
        surahMetaMap
      );
      if (span) {
        return {
          start: span.start,
          count: rangeMode === 'continuous' ? 0 : span.count,
        };
      }
      return {
        start: { surahId: fromSurahId, ayahNum: fromAyah },
        count: rangeMode === 'continuous' ? 0 : 1,
      };
    }

    if (scopeType === 'jozz') {
      const span = getJozzAyahSpan(
        mushafDataset,
        fromJozz,
        rangeMode === 'range' ? toJozz : fromJozz,
        surahMetaMap
      );
      if (span) {
        return {
          start: span.start,
          count: rangeMode === 'continuous' ? 0 : span.count,
        };
      }
      return {
        start: { surahId: fromSurahId, ayahNum: fromAyah },
        count: rangeMode === 'continuous' ? 0 : 1,
      };
    }

    // scopeType === 'surah'
    const start = { surahId: fromRangeSurahId, ayahNum: 1 };
    if (rangeMode === 'continuous') {
      return { start, count: 0 };
    }
    const endSid = rangeMode === 'single' ? fromRangeSurahId : toRangeSurahId;
    const endTotal = surahMetaMap.get(endSid)?.totalAyat ?? 1;
    return {
      start,
      count: countAyahsBetween(start, { surahId: endSid, ayahNum: endTotal }, surahMetaMap),
    };
  }, [
    scopeType,
    rangeMode,
    fromSurahId,
    fromAyah,
    toSurahId,
    toAyah,
    fromPage,
    toPage,
    fromJozz,
    toJozz,
    fromRangeSurahId,
    toRangeSurahId,
    mushafDataset,
    surahMetaMap,
  ]);

  const canRepeatSection = resolvedSelection.count > 1;
  const selectionSummaryText = useMemo(() => {
    if (resolvedSelection.count === 0) {
      const sName = surahMetaMap.get(resolvedSelection.start.surahId)?.name ?? '';
      return `متصل من ${sName} (${toArabicDigits(resolvedSelection.start.ayahNum)})`;
    }
    if (resolvedSelection.count === 1) return 'آية واحدة';
    if (resolvedSelection.count === 2) return 'آيتان';
    if (resolvedSelection.count <= 10) return `${toArabicDigits(resolvedSelection.count)} آيات`;
    return `${toArabicDigits(resolvedSelection.count)} آية`;
  }, [resolvedSelection, surahMetaMap]);

  if (!target || typeof document === 'undefined') return null;

  const openSurahId = currentPageSurahId ?? target.surahId;
  const isSameActiveTarget =
    activeAudioTarget?.surahId === resolvedSelection.start.surahId &&
    activeAudioTarget?.ayahNum === resolvedSelection.start.ayahNum;
  const isLoadingThisTarget = Boolean(isSameActiveTarget && isLoading);
  const canStopSession = Boolean(activeAudioTarget || isPlaying || isLoading);

  const handleSelectScopeTab = (nextScope: AudioScopeType) => {
    setScopeType(nextScope);
    setStopAtPageEndDraft(nextScope === 'page' && rangeMode !== 'continuous');
  };

  const handleSelectRangeMode = (nextMode: AudioRangeMode) => {
    setRangeMode(nextMode);
    setStopAtPageEndDraft(scopeType === 'page' && nextMode !== 'continuous');
  };

  const handleChangeFromSurah = (nextSid: number) => {
    const initialAyah = 1;
    setFromSurahId(nextSid);
    setFromAyah(initialAyah);
    if (
      compareAyahRefs(
        { surahId: toSurahId, ayahNum: toAyah },
        { surahId: nextSid, ayahNum: initialAyah }
      ) < 0
    ) {
      setToSurahId(nextSid);
      setToAyah(initialAyah);
    }
  };

  const handleChangeFromAyah = (nextAyah: number) => {
    setFromAyah(nextAyah);
    if (
      compareAyahRefs(
        { surahId: toSurahId, ayahNum: toAyah },
        { surahId: fromSurahId, ayahNum: nextAyah }
      ) < 0
    ) {
      setToSurahId(fromSurahId);
      setToAyah(nextAyah);
    }
  };

  const handleChangeToSurah = (nextSid: number) => {
    const nextTotal = surahMetaMap.get(nextSid)?.totalAyat ?? 7;
    setToSurahId(nextSid);
    if (nextSid === fromSurahId) {
      setToAyah((prev) => Math.max(fromAyah, Math.min(nextTotal, prev)));
    } else {
      setToAyah(Math.min(nextTotal, 1));
    }
  };

  const handleChangeFromPage = (nextPage: number) => {
    setFromPage(nextPage);
    if (toPage < nextPage) setToPage(nextPage);
  };

  const handleChangeFromJozz = (nextJozz: number) => {
    setFromJozz(nextJozz);
    if (toJozz < nextJozz) setToJozz(nextJozz);
  };

  const handleChangeFromRangeSurah = (nextSid: number) => {
    setFromRangeSurahId(nextSid);
    if (toRangeSurahId < nextSid) setToRangeSurahId(nextSid);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartPlayback({
      surahId: resolvedSelection.start.surahId,
      ayahNum: resolvedSelection.start.ayahNum,
      reciterId: reciterDraft,
      rate: rateDraft,
      repeat: repeatDraft,
      repeatSection: canRepeatSection && repeatSectionDraft,
      ayahCount: resolvedSelection.count,
      autoFollow: autoFollowDraft,
      pauseGap: pauseGapDraft,
      stopAtPageEnd: scopeType === 'page' && rangeMode !== 'continuous' ? stopAtPageEndDraft : false,
    });
    onClose();
  };

  return createPortal(
    <div
      className="audio-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="التحكم في التلاوة والمقطع"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        ref={modalCardRef}
        tabIndex={-1}
        className="audio-modal-card"
        data-annotation-ui="true"
        onSubmit={handleSubmit}
      >
        {/* Top Action Bar: Close (Right) + Pause/Apply CTA (Left) */}
        <header className="audio-modal-header">
          <div className="audio-modal-header-right">
            <button
              type="button"
              className="audio-modal-close-btn"
              onClick={onClose}
              aria-label="إغلاق نافذة التلاوة"
              title="إغلاق (Esc)"
            >
              <X className="w-4 h-4" strokeWidth={2.2} />
            </button>
            <h2 className="audio-modal-heading">التحكم في التلاوة</h2>
          </div>

          <div className="audio-modal-header-actions">
            {isPlaying && (
              <button
                type="button"
                className="audio-top-stop-btn"
                onClick={() => {
                  onPausePlayback();
                  onClose();
                }}
              >
                <Pause className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
                <span>إيقاف</span>
              </button>
            )}
            <button type="submit" className="audio-top-play-btn">
              <span>{isPlaying ? 'تطبيق التلاوة' : 'تشغيل التلاوة'}</span>
              {isLoadingThisTarget ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <div className="audio-modal-body">
          {/* 1. القارئ */}
          <section className="audio-section" aria-labelledby="audio-sec-reciter">
            <div className="audio-section-head">
              <span id="audio-sec-reciter" className="audio-section-label">
                القارئ
              </span>
            </div>
            <div className="audio-group-card">
              <div className="audio-reciter-box">
                <span className="audio-reciter-avatar" aria-hidden="true">
                  <Volume2 className="w-4 h-4" strokeWidth={2.1} />
                </span>
                <div className="audio-select-wrap">
                  <select
                    aria-label="اختيار القارئ"
                    className="audio-native-select"
                    value={reciterDraft}
                    onChange={(e) => setReciterDraft(e.target.value as ReciterId)}
                  >
                    <optgroup label="للتلقين والتحفيظ">
                      {teachingReciters.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} — {r.style}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="التلاوة المرتّلة">
                      {murattalReciters.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown className="audio-select-chevron w-4 h-4" aria-hidden="true" />
                </div>
              </div>
            </div>
          </section>

          {/* 3. نطاق التلاوة */}
          <section className="audio-section" aria-labelledby="audio-sec-range">
            <div className="audio-section-head">
              <span id="audio-sec-range" className="audio-section-label">
                نطاق التلاوة
              </span>
              <span className="audio-range-summary">{selectionSummaryText}</span>
            </div>

            <div className="audio-group-card is-range-card">
              <div className="audio-seg-track is-4" role="tablist" aria-label="نطاق التلاوة">
                {(
                  [
                    { id: 'ayah', label: 'الآية' },
                    { id: 'page', label: 'الصفحة' },
                    { id: 'jozz', label: 'الجزء' },
                    { id: 'surah', label: 'سورة' },
                  ] as const
                ).map((tab) => {
                  const active = scopeType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`audio-seg-tab ${active ? 'is-active' : ''}`}
                      onClick={() => handleSelectScopeTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="audio-seg-track is-3" role="group" aria-label="نوع التحديد">
                <button
                  type="button"
                  aria-pressed={rangeMode === 'continuous'}
                  className={`audio-seg-tab ${rangeMode === 'continuous' ? 'is-active' : ''}`}
                  onClick={() => handleSelectRangeMode('continuous')}
                  title="تلاوة مستمرة بلا توقف من نقطة البداية"
                >
                  متصل
                </button>
                <button
                  type="button"
                  aria-pressed={rangeMode === 'range'}
                  className={`audio-seg-tab ${rangeMode === 'range' ? 'is-active' : ''}`}
                  onClick={() => handleSelectRangeMode('range')}
                >
                  المقطع
                </button>
                <button
                  type="button"
                  aria-pressed={rangeMode === 'single'}
                  className={`audio-seg-tab ${rangeMode === 'single' ? 'is-active' : ''}`}
                  onClick={() => handleSelectRangeMode('single')}
                >
                  فقط
                </button>
              </div>

              <div className="audio-pickers-stack">
                {scopeType === 'ayah' && (
                  <>
                    <div className="audio-picker-block">
                      <span className="audio-picker-kicker">
                        {rangeMode === 'single' ? 'الآية' : 'من'}
                      </span>
                      <div className="audio-dual-picker">
                        <div className="audio-pill-select-wrap is-surah">
                          <select
                            aria-label="سورة البداية"
                            className="audio-pill-select"
                            value={fromSurahId}
                            onChange={(e) => handleChangeFromSurah(Number(e.target.value))}
                          >
                            {orderedSurahs.map((s) => (
                              <option key={s.id} value={s.id}>
                                {toArabicDigits(s.id)}. {s.name}
                                {s.id === openSurahId ? ' (المفتوحة)' : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                        <div className="audio-pill-select-wrap is-num">
                          <select
                            aria-label="رقم آية البداية"
                            className="audio-pill-select is-num"
                            value={fromAyah}
                            onChange={(e) => handleChangeFromAyah(Number(e.target.value))}
                          >
                            {fromAyahOptions.map((num) => (
                              <option key={num} value={num}>
                                {toArabicDigits(num)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                      </div>
                    </div>

                    {rangeMode === 'range' && (
                      <>
                        <div className="audio-card-divider" aria-hidden="true" />
                        <div className="audio-picker-block">
                          <span className="audio-picker-kicker">إلى</span>
                          <div className="audio-dual-picker">
                            <div className="audio-pill-select-wrap is-surah">
                              <select
                                aria-label="سورة النهاية"
                                className="audio-pill-select"
                                value={toSurahId}
                                onChange={(e) => handleChangeToSurah(Number(e.target.value))}
                              >
                                {orderedSurahs
                                  .filter((s) => s.id >= fromSurahId)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {toArabicDigits(s.id)}. {s.name}
                                      {s.id === openSurahId ? ' (المفتوحة)' : ''}
                                    </option>
                                  ))}
                              </select>
                              <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                            </div>
                            <div className="audio-pill-select-wrap is-num">
                              <select
                                aria-label="رقم آية النهاية"
                                className="audio-pill-select is-num"
                                value={toAyah}
                                onChange={(e) => setToAyah(Number(e.target.value))}
                              >
                                {toAyahOptions.map((num) => (
                                  <option key={num} value={num}>
                                    {toArabicDigits(num)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {scopeType === 'page' && (
                  <>
                    <div className="audio-picker-block">
                      <span className="audio-picker-kicker">
                        {rangeMode === 'single' ? 'الصفحة' : 'من'}
                      </span>
                      <div className="audio-pill-select-wrap">
                        <select
                          aria-label="صفحة البداية"
                          className="audio-pill-select"
                          value={fromPage}
                          onChange={(e) => handleChangeFromPage(Number(e.target.value))}
                        >
                          {pageNumbers.map((p) => (
                            <option key={p} value={p}>
                              صفحة {toArabicDigits(p)}
                              {p === (currentPageNum ?? -1) ? ' (الحالية)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                    </div>

                    {rangeMode === 'range' && (
                      <>
                        <div className="audio-card-divider" aria-hidden="true" />
                        <div className="audio-picker-block">
                          <span className="audio-picker-kicker">إلى</span>
                          <div className="audio-pill-select-wrap">
                            <select
                              aria-label="صفحة النهاية"
                              className="audio-pill-select"
                              value={toPage}
                              onChange={(e) => setToPage(Number(e.target.value))}
                            >
                              {pageNumbers
                                .filter((p) => p >= fromPage)
                                .map((p) => (
                                  <option key={p} value={p}>
                                    صفحة {toArabicDigits(p)}
                                  </option>
                                ))}
                            </select>
                            <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {scopeType === 'jozz' && (
                  <>
                    <div className="audio-picker-block">
                      <span className="audio-picker-kicker">
                        {rangeMode === 'single' ? 'الجزء' : 'من'}
                      </span>
                      <div className="audio-pill-select-wrap">
                        <select
                          aria-label="جزء البداية"
                          className="audio-pill-select"
                          value={fromJozz}
                          onChange={(e) => handleChangeFromJozz(Number(e.target.value))}
                        >
                          {jozzNumbers.map((j) => (
                            <option key={j} value={j}>
                              الجزء {toArabicDigits(j)}
                              {j === (currentJozz ?? -1) ? ' (الحالي)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                    </div>

                    {rangeMode === 'range' && (
                      <>
                        <div className="audio-card-divider" aria-hidden="true" />
                        <div className="audio-picker-block">
                          <span className="audio-picker-kicker">إلى</span>
                          <div className="audio-pill-select-wrap">
                            <select
                              aria-label="جزء النهاية"
                              className="audio-pill-select"
                              value={toJozz}
                              onChange={(e) => setToJozz(Number(e.target.value))}
                            >
                              {jozzNumbers
                                .filter((j) => j >= fromJozz)
                                .map((j) => (
                                  <option key={j} value={j}>
                                    الجزء {toArabicDigits(j)}
                                  </option>
                                ))}
                            </select>
                            <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {scopeType === 'surah' && (
                  <>
                    <div className="audio-picker-block">
                      <span className="audio-picker-kicker">
                        {rangeMode === 'single' ? 'السورة' : 'من'}
                      </span>
                      <div className="audio-pill-select-wrap">
                        <select
                          aria-label="سورة البداية"
                          className="audio-pill-select"
                          value={fromRangeSurahId}
                          onChange={(e) => handleChangeFromRangeSurah(Number(e.target.value))}
                        >
                          {orderedSurahs.map((s) => (
                            <option key={s.id} value={s.id}>
                              {toArabicDigits(s.id)}. سورة {s.name} ({toArabicDigits(s.totalAyat)} آية)
                              {s.id === openSurahId ? ' — المفتوحة' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                    </div>

                    {rangeMode === 'range' && (
                      <>
                        <div className="audio-card-divider" aria-hidden="true" />
                        <div className="audio-picker-block">
                          <span className="audio-picker-kicker">إلى</span>
                          <div className="audio-pill-select-wrap">
                            <select
                              aria-label="سورة النهاية"
                              className="audio-pill-select"
                              value={toRangeSurahId}
                              onChange={(e) => setToRangeSurahId(Number(e.target.value))}
                            >
                              {orderedSurahs
                                .filter((s) => s.id >= fromRangeSurahId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {toArabicDigits(s.id)}. سورة {s.name} ({toArabicDigits(s.totalAyat)} آية)
                                  </option>
                                ))}
                            </select>
                            <ChevronDown className="audio-pill-chevron w-3.5 h-3.5" aria-hidden="true" />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* 4. التكرار والسرعة وسكتة الترديد */}
          <section className="audio-section" aria-labelledby="audio-sec-tuning">
            <div className="audio-section-head">
              <span id="audio-sec-tuning" className="audio-section-label">
                التكرار والسرعة والترديد
              </span>
            </div>

            <div className="audio-group-card audio-settings-stack">
              <div className="audio-tuning-row">
                <span className="audio-picker-kicker">تكرار الآية</span>
                <div className="audio-seg-track is-5" role="group" aria-label="تكرار الآية">
                  {AYAH_REPEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={repeatDraft === opt}
                      className={`audio-seg-tab ${repeatDraft === opt ? 'is-active' : ''}`}
                      onClick={() => setRepeatDraft(opt)}
                    >
                      {opt === 0 ? '∞' : `${toArabicDigits(opt)}×`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="audio-card-divider" aria-hidden="true" />

              <div className="audio-tuning-row">
                <span className="audio-picker-kicker">سرعة القراءة</span>
                <div className="audio-seg-track is-4" role="group" aria-label="سرعة التلاوة">
                  {PLAYBACK_RATE_OPTIONS.map((rOpt) => (
                    <button
                      key={rOpt}
                      type="button"
                      aria-pressed={rateDraft === rOpt}
                      className={`audio-seg-tab ${rateDraft === rOpt ? 'is-active' : ''}`}
                      onClick={() => setRateDraft(rOpt)}
                    >
                      {toArabicDigits(rOpt)}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="audio-card-divider" aria-hidden="true" />

              <div className="audio-tuning-row">
                <span className="audio-picker-kicker">سكتة الترديد</span>
                <div className="audio-seg-track is-4" role="group" aria-label="سكتة الترديد">
                  {AUDIO_PAUSE_GAP_OPTIONS.map((gOpt) => (
                    <button
                      key={gOpt.id}
                      type="button"
                      aria-pressed={pauseGapDraft === gOpt.id}
                      className={`audio-seg-tab ${pauseGapDraft === gOpt.id ? 'is-active' : ''}`}
                      onClick={() => setPauseGapDraft(gOpt.id)}
                    >
                      {gOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 5. خيارات المتابعة */}
          <section className="audio-section" aria-label="خيارات المتابعة والتكرار">
            <div className="audio-group-card is-toggles">
              <div className="audio-toggle-row">
                <span className="audio-toggle-title">تتبّع الصفحة والآية تلقائياً</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoFollowDraft}
                  aria-label="تتبّع الصفحة والآية تلقائياً"
                  className={`audio-switch ${autoFollowDraft ? 'is-on' : ''}`}
                  onClick={() => setAutoFollowDraft((prev) => !prev)}
                >
                  <span className="audio-switch-thumb" />
                </button>
              </div>

              {canRepeatSection && (
                <>
                  <div className="audio-card-divider" aria-hidden="true" />
                  <div className="audio-toggle-row">
                    <span className="audio-toggle-title">تكرار هذا المقطع كاملاً</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={repeatSectionDraft}
                      aria-label="تكرار هذا المقطع كاملاً"
                      className={`audio-switch ${repeatSectionDraft ? 'is-on' : ''}`}
                      onClick={() => setRepeatSectionDraft((prev) => !prev)}
                    >
                      <span className="audio-switch-thumb" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {canStopSession && onStopPlayback && (
            <button
              type="button"
              className="audio-modal-end-btn"
              onClick={() => {
                onStopPlayback();
                onClose();
              }}
            >
              <Square className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
              <span>إنهاء التلاوة الحالية وإلغاء التحديد</span>
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body
  );
};

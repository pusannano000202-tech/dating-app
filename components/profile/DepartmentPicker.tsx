'use client'

import {
  type FocusEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, Check, Loader2, Search, Trash2 } from 'lucide-react'
import {
  type DepartmentCatalog,
  type DepartmentCatalogLoadState,
  type DepartmentCatalogEntry,
  type DepartmentPickerValidationState,
  parseDepartmentCatalog,
  readDepartmentCatalogResponse,
  resolveDepartmentLoadStateForSchoolChange,
  resolveDepartmentPickerValidationState,
  searchDepartmentCatalog,
  shouldConfirmDepartmentMismatch,
  shouldConfirmUnverifiedDepartment,
} from '../../lib/profile/department-catalog'

export type DepartmentPickerProps = {
  schoolId: string
  value: string
  onChange: (department: string) => void
  allowCustomEntry: boolean
  onValidationChange?: (state: DepartmentPickerValidationState) => void
}

export default function DepartmentPicker({
  schoolId,
  value,
  onChange,
  allowCustomEntry,
  onValidationChange,
}: DepartmentPickerProps) {
  const [catalog, setCatalog] = useState<DepartmentCatalog | null>(null)
  const [loadState, setLoadState] = useState<DepartmentCatalogLoadState>(schoolId ? 'loading' : 'idle')
  const [query, setQuery] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [valueAtCatalogChange, setValueAtCatalogChange] = useState(value)
  const [suggestionMaxHeight, setSuggestionMaxHeight] = useState(192)
  const [schoolChangedSinceValidation, setSchoolChangedSinceValidation] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const currentValueRef = useRef(value)
  const previousSchoolIdRef = useRef(schoolId)
  const inputAnchorRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const listboxId = useId()

  useEffect(() => {
    currentValueRef.current = value
    setQuery(value)
  }, [value])

  useEffect(() => {
    const schoolChanged = previousSchoolIdRef.current !== schoolId
    previousSchoolIdRef.current = schoolId
    if (schoolChanged) {
      setSchoolChangedSinceValidation(true)
    }

    setCatalog(null)
    setIsOpen(false)
    setActiveIndex(0)
    setValueAtCatalogChange(currentValueRef.current)

    if (!schoolId) {
      setLoadState('idle')
      return
    }

    const controller = new AbortController()
    setLoadState('loading')

    void fetch(`/university-departments/${encodeURIComponent(schoolId)}.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Department catalog request failed: ${response.status}`)
        }

        const parsed = parseDepartmentCatalog(await readDepartmentCatalogResponse(response), schoolId)
        if (!parsed) {
          throw new Error('Department catalog schema is invalid')
        }

        if (controller.signal.aborted) return
        setCatalog(parsed)
        setLoadState('ready')
        setSchoolChangedSinceValidation(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setCatalog(null)
        setLoadState('error')
      })

    return () => controller.abort()
  }, [schoolId])

  const schoolChangedBeforeEffects = previousSchoolIdRef.current !== schoolId
  const effectiveLoadState = resolveDepartmentLoadStateForSchoolChange({
    schoolId,
    schoolChanged: schoolChangedBeforeEffects,
    loadState,
  })
  const activeCatalog = catalog?.schoolId === schoolId ? catalog : null
  const suggestions = useMemo(
    () => activeCatalog ? searchDepartmentCatalog(activeCatalog.departments, query) : [],
    [activeCatalog, query],
  )
  const hasCatalogMismatch = Boolean(
    (activeCatalog && shouldConfirmDepartmentMismatch(
      activeCatalog.departments,
      value,
      valueAtCatalogChange,
    )) ||
    shouldConfirmUnverifiedDepartment(
      value,
      valueAtCatalogChange,
      schoolChangedSinceValidation,
      effectiveLoadState === 'idle' || effectiveLoadState === 'error',
    ),
  )
  const inputDisabled = hasCatalogMismatch || (!allowCustomEntry && effectiveLoadState !== 'ready')
  const showSuggestions = isOpen && effectiveLoadState === 'ready' && suggestions.length > 0
  const boundedActiveIndex = Math.min(activeIndex, Math.max(suggestions.length - 1, 0))
  const validationState = resolveDepartmentPickerValidationState({
    value,
    loadState: effectiveLoadState,
    requiresConfirmation: hasCatalogMismatch,
    explicitlyKept: false,
  })

  useEffect(() => {
    onValidationChange?.(validationState)
  }, [onValidationChange, validationState])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, schoolId])

  useEffect(() => {
    if (!showSuggestions) return

    const updateSuggestionHeight = () => {
      const pickerBottom = inputAnchorRef.current?.getBoundingClientRect().bottom
      if (pickerBottom === undefined) return

      const availableHeight = window.innerHeight - pickerBottom - 152
      setSuggestionMaxHeight(Math.max(96, Math.min(192, availableHeight)))
    }

    updateSuggestionHeight()
    window.addEventListener('resize', updateSuggestionHeight)
    return () => window.removeEventListener('resize', updateSuggestionHeight)
  }, [showSuggestions])

  const selectDepartment = (department: DepartmentCatalogEntry) => {
    setQuery(department.name)
    setIsOpen(false)
    setActiveIndex(0)
    onChange(department.name)
  }

  const clearDepartment = () => {
    setQuery('')
    setIsOpen(false)
    setActiveIndex(0)
    setValueAtCatalogChange('')
    setSchoolChangedSinceValidation(false)
    onChange('')
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) return

    setIsOpen(false)
    if (!allowCustomEntry) {
      setQuery(value)
    }
  }

  return (
    <div className="min-w-0" onBlur={handleBlur}>
      <div ref={inputAnchorRef} className="relative min-w-0">
        <label htmlFor={inputId} className="sr-only">
          학과 검색 또는 직접 입력
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-boot-muted"
          size={16}
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showSuggestions}
          aria-activedescendant={
            showSuggestions ? `${listboxId}-option-${boundedActiveIndex}` : undefined
          }
          placeholder="학과명 또는 단과대명 검색"
          value={query}
          disabled={inputDisabled}
          onChange={(event) => {
            const nextValue = event.target.value
            setQuery(nextValue)
            setIsOpen(true)
            setActiveIndex(0)
            if (allowCustomEntry) {
              onChange(nextValue)
            }
          }}
          onFocus={() => {
            if (effectiveLoadState === 'ready') {
              setIsOpen(true)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false)
              if (!allowCustomEntry) setQuery(value)
              return
            }

            if (
              (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
              effectiveLoadState === 'ready' &&
              suggestions.length > 0
            ) {
              event.preventDefault()
              setIsOpen(true)
              setActiveIndex((current) => {
                if (!isOpen) return event.key === 'ArrowDown' ? 0 : suggestions.length - 1
                if (event.key === 'ArrowDown') return (current + 1) % suggestions.length
                return (current - 1 + suggestions.length) % suggestions.length
              })
              return
            }

            if ((event.key === 'Home' || event.key === 'End') && showSuggestions) {
              event.preventDefault()
              setActiveIndex(event.key === 'Home' ? 0 : suggestions.length - 1)
              return
            }

            if (event.key === 'Enter' && showSuggestions) {
              event.preventDefault()
              selectDepartment(suggestions[boundedActiveIndex])
            }
          }}
          className="w-full min-w-0 rounded-2xl border border-boot-hairline bg-white py-3.5 pl-11 pr-4 text-sm font-bold text-boot-ink outline-none transition placeholder:text-boot-muted/70 focus:border-boot-primary disabled:cursor-not-allowed disabled:bg-boot-soft disabled:opacity-60"
        />
      </div>

      <div aria-live="polite" className="mt-2 min-h-5 text-xs font-bold leading-5 text-boot-muted">
        {effectiveLoadState === 'idle' && (
          <p>
            학교를 먼저 선택하면 학과 목록을 불러와요.
            {allowCustomEntry && !hasCatalogMismatch && ' 지금은 직접 입력할 수 있어요.'}
          </p>
        )}
        {effectiveLoadState === 'loading' && (
          <p className="flex items-center gap-1.5">
            <Loader2 aria-hidden="true" className="animate-spin" size={14} />
            학과 목록을 불러오는 중이에요.
            {allowCustomEntry && ' 직접 입력도 가능해요.'}
          </p>
        )}
        {effectiveLoadState === 'error' && (
          <p className="flex items-start gap-1.5 text-rose-600">
            <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
            <span>
              학과 목록을 불러오지 못했어요.
              {hasCatalogMismatch
                ? ' 기존 학과를 먼저 비워 주세요.'
                : allowCustomEntry
                  ? ' 직접 입력해 주세요.'
                  : ' 학교를 다시 선택해 주세요.'}
            </span>
          </p>
        )}
        {effectiveLoadState === 'ready' && activeCatalog && (
          <p>{activeCatalog.schoolName} 학과 {activeCatalog.departments.length}개</p>
        )}
      </div>

      {showSuggestions && (
        <div
          id={listboxId}
          role="listbox"
          className="relative z-50 mt-2 w-full min-w-0 overflow-y-auto rounded-2xl border border-boot-hairline bg-white p-1 shadow-lg"
          style={{ maxHeight: suggestionMaxHeight }}
        >
          {suggestions.map((department, index) => (
            <button
              id={`${listboxId}-option-${index}`}
              key={department.name}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={department.name === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectDepartment(department)}
              className={[
                'flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-boot-soft focus:bg-boot-soft focus:outline-none',
                index === boundedActiveIndex ? 'bg-boot-soft' : '',
              ].join(' ')}
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-black leading-5 text-boot-ink">
                  {department.name}
                </span>
                <span className="mt-0.5 block break-words text-[11px] font-bold leading-4 text-boot-muted">
                  {department.college}
                </span>
              </span>
              {department.name === value && (
                <Check aria-label="선택됨" className="mt-0.5 shrink-0 text-boot-primary" size={16} />
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && effectiveLoadState === 'ready' && suggestions.length === 0 && (
        <p className="relative z-50 mt-2 w-full rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-xs font-bold leading-5 text-boot-muted shadow-sm">
          검색 결과가 없어요.{allowCustomEntry && ' 입력한 학과명을 그대로 사용할 수 있어요.'}
        </p>
      )}

      {hasCatalogMismatch && (
        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-950">
          <p className="font-bold">
            현재 학과가 새 학교 목록에 없어요. 학과를 비운 뒤 새 학교 기준으로 다시 선택하거나 직접 입력해 주세요.
          </p>
          <p className="mt-1 break-words text-amber-800">현재 입력: {value}</p>
          <button
            type="button"
            onClick={clearDepartment}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-amber-900 px-3 py-2 font-black text-white transition hover:bg-amber-950"
          >
            <Trash2 aria-hidden="true" size={14} />
            학과 비우기
          </button>
        </div>
      )}
    </div>
  )
}

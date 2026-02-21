'use client';

import { useState, useRef, useEffect } from 'react';

interface DateTimePickerProps {
  value?: string; // ISO string
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  /** ISO string – cannot select date/time before this */
  minDate?: string;
  /** ISO string – cannot select date/time after this */
  maxDate?: string;
}

export default function DateTimePicker({ value, onChange, placeholder = 'Select date & time', className = '', minDate, maxDate }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'time'>('calendar');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Parse current value
  const currentDate = value ? new Date(value) : null;
  const [selectedYear, setSelectedYear] = useState(currentDate?.getFullYear() || new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate?.getMonth() || new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(currentDate?.getDate() || null);
  const [selectedHour, setSelectedHour] = useState(currentDate?.getHours() || 12);
  const [selectedMinute, setSelectedMinute] = useState(currentDate?.getMinutes() || 0);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update internal state when value changes externally
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      setSelectedYear(date.getFullYear());
      setSelectedMonth(date.getMonth());
      setSelectedDay(date.getDate());
      setSelectedHour(date.getHours());
      setSelectedMinute(date.getMinutes());
    }
  }, [value]);

  // Generate calendar days
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const firstDay = getFirstDayOfMonth(selectedYear, selectedMonth);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay }, (_, i) => i);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleDayClick = (day: number) => {
    setSelectedDay(day);
    if (minDateObj && selectedYear === minDateObj.getFullYear() && selectedMonth === minDateObj.getMonth() && day === minDateObj.getDate()) {
      setSelectedHour(minDateObj.getHours());
      setSelectedMinute(minDateObj.getMinutes());
    }
    setViewMode('time');
  };

  const minDateObj = minDate ? new Date(minDate) : null;
  const maxDateObj = maxDate ? new Date(maxDate) : null;

  const isDayDisabled = (day: number) => {
    const startOfDay = new Date(selectedYear, selectedMonth, day, 0, 0, 0);
    const endOfDay = new Date(selectedYear, selectedMonth, day, 23, 59, 59);
    if (minDateObj && endOfDay < minDateObj) return true;
    if (maxDateObj && startOfDay > maxDateObj) return true;
    return false;
  };

  const handleApply = () => {
    if (selectedDay !== null) {
      let date = new Date(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute);
      if (minDateObj && date < minDateObj) date = minDateObj;
      if (maxDateObj && date > maxDateObj) date = maxDateObj;
      onChange(date.toISOString());
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null);
    setSelectedDay(null);
    setIsOpen(false);
  };

  const formatDisplayValue = () => {
    if (!currentDate) return '';
    // More compact format to fit in one line
    const month = currentDate.toLocaleString('en-US', { month: 'short' });
    const day = currentDate.getDate();
    const year = currentDate.getFullYear();
    const time = currentDate.toLocaleString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `${month} ${day}, ${year}, ${time}`;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input trigger */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-forge text-left flex items-center justify-between w-full"
      >
        <span className={`${currentDate ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'} text-xs truncate pr-2`}>
          {formatDisplayValue() || placeholder}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - fixed positioning to break out of container */}
      {isOpen && (
        <div 
          className="fixed z-[9999] min-w-[320px] bg-[#0A0908] border border-gray-700/50 rounded-lg shadow-2xl overflow-hidden"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: dropdownPosition.width > 320 ? `${dropdownPosition.width}px` : '320px'
          }}
        >
          {/* Header tabs */}
          <div className="flex border-b border-gray-700/50">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-orange-500/20 text-orange-400 border-b-2 border-orange-400'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              Date
            </button>
            <button
              type="button"
              onClick={() => setViewMode('time')}
              disabled={selectedDay === null}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'time'
                  ? 'bg-orange-500/20 text-orange-400 border-b-2 border-orange-400'
                  : selectedDay === null
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              Time
            </button>
          </div>

          <div className="p-3">
            {viewMode === 'calendar' ? (
              <>
                {/* Month/Year selector */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMonth === 0) {
                        setSelectedMonth(11);
                        setSelectedYear(selectedYear - 1);
                      } else {
                        setSelectedMonth(selectedMonth - 1);
                      }
                    }}
                    className="p-2 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-200">
                      {monthNames[selectedMonth]} {selectedYear}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMonth === 11) {
                        setSelectedMonth(0);
                        setSelectedYear(selectedYear + 1);
                      } else {
                        setSelectedMonth(selectedMonth + 1);
                      }
                    }}
                    className="p-2 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                {/* Day labels */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                    <div key={day} className="text-xs font-medium text-gray-500 text-center py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {emptyDays.map((i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {daysArray.map((day) => {
                    const isSelected = day === selectedDay;
                    const isDisabled = isDayDisabled(day);
                    const isToday =
                      !isDisabled &&
                      day === new Date().getDate() &&
                      selectedMonth === new Date().getMonth() &&
                      selectedYear === new Date().getFullYear();

                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && handleDayClick(day)}
                        className={`
                          aspect-square p-2 text-sm rounded-lg transition-all
                          ${isDisabled
                            ? 'text-gray-600 cursor-not-allowed opacity-50'
                            : isSelected
                            ? 'bg-orange-500 text-white font-bold scale-105 shadow-lg shadow-orange-500/30'
                            : isToday
                            ? 'bg-gray-700/50 text-orange-400 font-medium hover:bg-gray-700'
                            : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
                          }
                        `}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Time picker - compressed */}
                <div className="space-y-3">
                  {/* Hour and Minute side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Hour */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-1.5 block">Hour</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedHour(h => (h === 0 ? 23 : h - 1))}
                          className="p-1 hover:bg-gray-800/50 rounded transition-colors text-gray-400 hover:text-gray-200"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="flex-1 text-center">
                          <div className="bg-gray-800/50 rounded py-1.5 text-lg font-bold text-gray-100">
                            {selectedHour.toString().padStart(2, '0')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedHour(h => (h === 23 ? 0 : h + 1))}
                          className="p-1 hover:bg-gray-800/50 rounded transition-colors text-gray-400 hover:text-gray-200"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Minute */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-1.5 block">Minute</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedMinute(m => (m === 0 ? 59 : m - 1))}
                          className="p-1 hover:bg-gray-800/50 rounded transition-colors text-gray-400 hover:text-gray-200"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="flex-1 text-center">
                          <div className="bg-gray-800/50 rounded py-1.5 text-lg font-bold text-gray-100">
                            {selectedMinute.toString().padStart(2, '0')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedMinute(m => (m === 59 ? 0 : m + 1))}
                          className="p-1 hover:bg-gray-800/50 rounded transition-colors text-gray-400 hover:text-gray-200"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick presets */}
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-1.5 block">Quick Select</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: '12:00 AM', hour: 0, minute: 0 },
                        { label: '9:00 AM', hour: 9, minute: 0 },
                        { label: '12:00 PM', hour: 12, minute: 0 },
                        { label: '6:00 PM', hour: 18, minute: 0 },
                        { label: '9:00 PM', hour: 21, minute: 0 },
                        { label: '11:59 PM', hour: 23, minute: 59 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setSelectedHour(preset.hour);
                            setSelectedMinute(preset.minute);
                          }}
                          className={`
                            px-2 py-1.5 text-xs rounded transition-all font-medium
                            ${selectedHour === preset.hour && selectedMinute === preset.minute
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-400/50'
                              : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-300 border border-gray-700/30'
                            }
                          `}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t border-gray-700/50 p-2 flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedDay === null}
              className={`
                flex-1 px-3 py-1.5 text-xs font-bold rounded transition-all
                ${selectedDay !== null
                  ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20'
                  : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

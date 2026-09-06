'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';
import { useApp } from './provider';
const months = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];
export function DatePicker({
  value,
  onChange,
  label,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
}) {
  const { date, fmt, boot } = useApp();
  const [open, setOpen] = useState(false);
  const initial = toJalaali(value ? new Date(value + 'T12:00:00') : new Date());
  const [month, setMonth] = useState(initial.jm);
  const [year, setYear] = useState(initial.jy);
  useEffect(() => {
    if (value) {
      const selected = toJalaali(new Date(value + 'T12:00:00'));
      setMonth(selected.jm);
      setYear(selected.jy);
    }
  }, [value]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, []);
  if (boot?.settings.calendar === 'میلادی')
    return (
      <input
        aria-label={label}
        className="input"
        type="date"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  const first = toGregorian(year, month, 1);
  const offset = (new Date(first.gy, first.gm - 1, first.gd).getDay() + 1) % 7;
  const move = (direction: number) => {
    let m = month + direction,
      y = year;
    if (m < 1) {
      m = 12;
      y--;
    }
    if (m > 12) {
      m = 1;
      y++;
    }
    setMonth(m);
    setYear(y);
  };
  const choose = (day: number) => {
    const g = toGregorian(year, month, day);
    onChange(`${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`);
    setOpen(false);
  };
  return (
    <div className="date-picker" ref={ref}>
      <button
        type="button"
        className={`input date-trigger ${!value ? 'muted' : ''}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{value ? date(value) : 'انتخاب تاریخ'}</span>
        <CalendarDays size={17} />
      </button>
      {open && (
        <div className="calendar-popover">
          <div className="calendar-head">
            <button
              type="button"
              className="icon-button"
              onClick={() => move(-1)}
              aria-label="ماه قبل"
            >
              <ChevronRight size={17} />
            </button>
            <select
              aria-label="ماه"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {months.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="سال تقویم"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 151 }, (_, i) => 1300 + i).map((y) => (
                <option key={y} value={y}>
                  {fmt(y).replace(/[٬,]/g, '')}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              onClick={() => move(1)}
              aria-label="ماه بعد"
            >
              <ChevronLeft size={17} />
            </button>
          </div>
          <div className="calendar-grid">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
              <small key={i}>{d}</small>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: jalaaliMonthLength(year, month) }, (_, i) => (
              <button
                type="button"
                key={i}
                className={
                  initial.jy === year && initial.jm === month && initial.jd === i + 1 && value
                    ? 'selected-day'
                    : ''
                }
                onClick={() => choose(i + 1)}
              >
                {fmt(i + 1)}
              </button>
            ))}
          </div>
          <div className="calendar-foot">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                const now = new Date();
                onChange(
                  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
                );
                setOpen(false);
              }}
            >
              امروز
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              <X size={12} /> پاک کردن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { ArrowRight, X, AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';
export function PageHeading({
  title,
  description,
  eyebrow,
  children,
  back,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: React.ReactNode;
  back?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        {back && (
          <Link className="back-link" href={back}>
            <ArrowRight size={16} /> بازگشت
          </Link>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function Badge({ value }: { value: unknown }) {
  const text = String(value || '—');
  const color = ['تأیید شده', 'فعال', 'پرداخت شده', 'وصول شده', 'تکمیل شده', 'باز'].includes(text)
    ? 'green'
    : ['لغو شده', 'غیرفعال', 'برگشت خورده', 'بسته', 'اسقاط شده'].includes(text)
      ? 'red'
      : ['پیش‌نویس', 'در جریان', 'در حال اجرا', 'در حال تولید', 'برنامه‌ریزی'].includes(text)
        ? 'amber'
        : 'gray';
  return (
    <span className={`badge badge-${color}`}>
      <i />
      {text}
    </span>
  );
}
export function Loading() {
  return (
    <div className="skeleton-stack" aria-label="در حال بارگذاری">
      <div className="skeleton skeleton-title" />
      <div className="skeleton-stats">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const element = ref.current;
    element?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const els = element?.querySelectorAll<HTMLElement>(
          'button, a, input, select, textarea, [tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === element)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        tabIndex={-1}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="بستن">
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-body">
        <span className="confirm-icon">
          <AlertTriangle size={28} />
        </span>
        <p>{description}</p>
      </div>
      <div className="modal-actions">
        <button className="btn btn-danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'در حال انجام…' : 'تأیید و ادامه'}
        </button>
        <button className="btn" onClick={onClose}>
          انصراف
        </button>
      </div>
    </Modal>
  );
}

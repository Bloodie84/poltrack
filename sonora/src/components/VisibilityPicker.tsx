'use client';

import type { Visibility } from '@/lib/types';
import { EyeIcon, EyeOffIcon, LockIcon } from './icons';

const OPTIONS: { value: Visibility; label: string; desc: string; Icon: typeof EyeIcon }[] = [
  { value: 'public', label: 'Public', desc: 'Anyone can find it and open the link.', Icon: EyeIcon },
  { value: 'unlisted', label: 'Unlisted', desc: 'Only people with the link can listen.', Icon: EyeOffIcon },
  { value: 'private', label: 'Private', desc: 'Only you can listen to it.', Icon: LockIcon },
];

export default function VisibilityPicker({
  value,
  onChange,
  name = 'visibility',
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  name?: string;
}) {
  return (
    <div className="radio-cards" role="radiogroup" aria-label="Visibility">
      {OPTIONS.map(({ value: v, label, desc, Icon }) => (
        <label key={v} className={`radio-card ${value === v ? 'radio-card--on' : ''}`}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span className="radio-card__dot" aria-hidden="true" />
          <span style={{ minWidth: 0 }}>
            <span className="radio-card__title row" style={{ gap: 7 }}>
              <Icon size={14} /> {label}
            </span>
            <span className="radio-card__desc">{desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

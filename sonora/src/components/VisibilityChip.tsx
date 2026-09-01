import type { Visibility } from '@/lib/types';
import { EyeIcon, LinkIcon, LockIcon } from './icons';

const LABEL: Record<Visibility, { text: string; Icon: typeof EyeIcon; title: string }> = {
  public: { text: 'Public', Icon: EyeIcon, title: 'Listed publicly and open to anyone' },
  unlisted: { text: 'Unlisted', Icon: LinkIcon, title: 'Reachable only with the link' },
  private: { text: 'Private', Icon: LockIcon, title: 'Only you can open this' },
};

export default function VisibilityChip({ value }: { value: Visibility }) {
  const { text, Icon, title } = LABEL[value];
  return (
    <span className={`chip chip--${value}`} title={title}>
      <Icon size={12} /> {text}
    </span>
  );
}

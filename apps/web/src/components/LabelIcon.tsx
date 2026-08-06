import type { LabelIcon } from '@sagnex/contracts';
import DOMPurify from 'dompurify';
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Code2,
  Dumbbell,
  Flag,
  GraduationCap,
  HeartPulse,
  House,
  Lightbulb,
  Music,
  Palette,
  Plane,
  ShoppingBag,
  Star,
  Tag,
  Target,
  Users,
  WalletCards,
  type LucideIcon
} from 'lucide-react';

export const labelIconOptions: Array<{ value: LabelIcon; label: string; icon: LucideIcon }> = [
  { value: 'tag', label: '标签', icon: Tag },
  { value: 'book-open', label: '阅读', icon: BookOpen },
  { value: 'briefcase-business', label: '工作', icon: BriefcaseBusiness },
  { value: 'code-2', label: '开发', icon: Code2 },
  { value: 'calendar-days', label: '日程', icon: CalendarDays },
  { value: 'flag', label: '里程碑', icon: Flag },
  { value: 'star', label: '重点', icon: Star },
  { value: 'house', label: '家庭', icon: House },
  { value: 'heart-pulse', label: '健康', icon: HeartPulse },
  { value: 'graduation-cap', label: '学习', icon: GraduationCap },
  { value: 'palette', label: '创作', icon: Palette },
  { value: 'plane', label: '旅行', icon: Plane },
  { value: 'shopping-bag', label: '购物', icon: ShoppingBag },
  { value: 'dumbbell', label: '运动', icon: Dumbbell },
  { value: 'lightbulb', label: '想法', icon: Lightbulb },
  { value: 'target', label: '目标', icon: Target },
  { value: 'wallet-cards', label: '财务', icon: WalletCards },
  { value: 'music', label: '音乐', icon: Music },
  { value: 'camera', label: '影像', icon: Camera },
  { value: 'users', label: '团队', icon: Users }
];

const iconMap = Object.fromEntries(labelIconOptions.map((option) => [option.value, option.icon])) as Record<LabelIcon, LucideIcon>;

export function LabelIconView({ icon, className }: { icon: LabelIcon; className?: string }) {
  if (icon.startsWith('emoji:')) {
    return <span className={`label-emoji ${className ?? ''}`} aria-hidden="true">{icon.slice(6)}</span>;
  }
  if (icon.startsWith('svg:')) {
    const markup = DOMPurify.sanitize(icon.slice(4), {
      USE_PROFILES: { svg: true, svgFilters: false },
      FORBID_TAGS: ['script', 'foreignObject', 'style', 'image', 'use'],
      FORBID_ATTR: ['href', 'xlink:href', 'style']
    });
    return <span className={`label-custom-svg ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
  }
  const Icon = iconMap[icon] ?? Tag;
  return <Icon className={className} aria-hidden="true" />;
}

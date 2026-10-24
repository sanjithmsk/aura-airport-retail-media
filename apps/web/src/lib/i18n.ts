/* The dictionaries, lifted verbatim from the reference implementation's
   I18N const. A locale is a flat key→string map plus its direction, so a
   missing key falls back to English rather than rendering a blank. */

export type Locale = 'en' | 'ar';
export type Dir = 'ltr' | 'rtl';

export interface Dictionary {
  dir: Dir;
  label: string;
  locale: string;
  [key: string]: string;
}

export const I18N: Record<Locale, Dictionary> = {
  en: {
    dir: 'ltr', label: 'English', locale: 'en-GB',
    'role.admin': 'Platform Admin', 'role.retailer': 'Retailer',
    'role.media': 'Media Manager', 'role.airline': 'Airline Rep',
    'role.screen': 'Passenger Screen',
    'nav.overview': 'Overview', 'nav.network': 'Network map', 'nav.incidents': 'Incidents',
    'nav.masterdata': 'Master data', 'nav.feeds': 'Feed health', 'nav.rules': 'Rule engine',
    'nav.decisions': 'Decision log',
    'nav.dashboard': 'Dashboard', 'nav.flow': 'Passenger flow', 'nav.campaigns': 'Campaigns',
    'nav.builder': 'Campaign builder', 'nav.creatives': 'Creative library', 'nav.promos': 'Promo codes',
    'nav.history': 'History', 'nav.inventory': 'Inventory', 'nav.yield': 'Yield & pricing',
    'nav.approvals': 'Approvals', 'nav.advertisers': 'Advertisers', 'nav.heatmap': 'Segment heatmap',
    'nav.flights': 'My flights', 'nav.gatemsg': 'Gate messaging', 'nav.goodwill': 'Delay goodwill',
    'nav.comarketing': 'Co-marketing', 'nav.screen': 'Screen', 'nav.demo': 'Demo script',
    'sim.play': 'Play', 'sim.pause': 'Pause', 'sim.speed': 'Speed', 'sim.jump': 'Jump to',
    'sim.inject': 'Inject event', 'sim.live': 'SIM',
    'kpi.screensOnline': 'Screens online', 'kpi.plays': 'Ad plays today',
    'kpi.impressions': 'Impressions', 'kpi.revenue': 'Revenue today',
    'kpi.campaigns': 'Active campaigns', 'kpi.latency': 'Avg screen latency',
    'why.title': 'Why this ad?', 'why.profile': 'Crowd profile in front of this screen',
    'why.candidates': 'Top candidates', 'why.rule': 'Winning rule', 'why.evidence': 'Evidence trail',
    'claim.title': 'Your offer', 'claim.cta': 'Claim this offer', 'claim.expires': 'Expires in',
    'claim.share': 'Share with family', 'claim.claimed': 'Claimed',
    'ad.scanToClaim': 'Scan to claim', 'ad.validUntil': 'Valid until boarding closes',
    'common.gate': 'Gate', 'common.zone': 'Zone', 'common.boarding': 'Boarding',
    'common.delayed': 'Delayed', 'common.ontime': 'On time', 'common.departed': 'Departed',
    'common.cancelled': 'Cancelled', 'common.final': 'Final call', 'common.scheduled': 'Scheduled',
    'common.pax': 'pax', 'common.min': 'min', 'common.dwell': 'dwell'
  },
  ar: {
    dir: 'rtl', label: 'العربية', locale: 'ar',
    'role.admin': 'مشرف المنصة', 'role.retailer': 'المتجر',
    'role.media': 'مدير الإعلان', 'role.airline': 'ممثل الناقل',
    'role.screen': 'شاشة الركاب',
    'nav.overview': 'نظرة عامة', 'nav.network': 'خريطة الشبكة',
    'nav.incidents': 'الأعطال', 'nav.masterdata': 'البيانات الرئيسية',
    'nav.feeds': 'سلامة التغذية', 'nav.rules': 'محرك القواعد',
    'nav.decisions': 'سجل القرارات',
    'nav.dashboard': 'لوحة المعلومات', 'nav.flow': 'تدفق الركاب',
    'nav.campaigns': 'الحملات', 'nav.builder': 'منشئ الحملات',
    'nav.creatives': 'مكتبة التصاميم', 'nav.promos': 'أكواد الخصم',
    'nav.history': 'السجل', 'nav.inventory': 'المخزون الإعلاني',
    'nav.yield': 'التسعير', 'nav.approvals': 'الموافقات',
    'nav.advertisers': 'المعلنون', 'nav.heatmap': 'خريطة الشرائح',
    'nav.flights': 'رحلاتي', 'nav.gatemsg': 'رسائل البوابة',
    'nav.goodwill': 'تعويض التأخير', 'nav.comarketing': 'التسويق المشترك',
    'nav.screen': 'الشاشة', 'nav.demo': 'نص العرض',
    'sim.play': 'تشغيل', 'sim.pause': 'إيقاف', 'sim.speed': 'السرعة',
    'sim.jump': 'الانتقال إلى', 'sim.inject': 'حقن حدث', 'sim.live': 'محاكاة',
    'kpi.screensOnline': 'الشاشات العاملة', 'kpi.plays': 'عروض اليوم',
    'kpi.impressions': 'المشاهدات', 'kpi.revenue': 'إيراد اليوم',
    'kpi.campaigns': 'حملات نشطة', 'kpi.latency': 'زمن الاستجابة',
    'why.title': 'لماذا هذا الإعلان؟', 'why.profile': 'ملف الحشد أمام الشاشة',
    'why.candidates': 'أفضل المرشحين', 'why.rule': 'القاعدة الفائزة',
    'why.evidence': 'مسار الأدلة',
    'claim.title': 'عرضك', 'claim.cta': 'احصل على العرض',
    'claim.expires': 'ينتهي خلال', 'claim.claimed': 'تم الحصول عليه',
    'claim.share': 'شارك مع العائلة',
    'ad.scanToClaim': 'امسح للحصول', 'ad.validUntil': 'صالح حتى إغلاق الصعود',
    'common.gate': 'بوابة', 'common.zone': 'منطقة', 'common.boarding': 'الصعود',
    'common.delayed': 'متأخرة', 'common.ontime': 'في الموعد', 'common.departed': 'غادرت',
    'common.cancelled': 'ملغاة', 'common.final': 'نداء أخير', 'common.scheduled': 'مجدولة',
    'common.pax': 'راكب', 'common.min': 'دقيقة', 'common.dwell': 'انتظار'
  }
};

export function translate(locale: Locale, key: string): string {
  return I18N[locale][key] ?? I18N.en[key] ?? key;
}

export function dirFor(locale: Locale): Dir {
  return I18N[locale].dir;
}

// The desktop's own words for the events area (keys "d.events.…"): English, and the app's other 19
// languages. Words the iPhone app already has are used from src/lib/i18n instead (see lib/i18n.ts):
// nearly everything on the Events pages, the map's layers, verse cards and the reading streak is
// one of the iPhone's own (events.*, map.*, verseCard.*, bible.*).
import type { AreaWords } from './types';

export const words: AreaWords = {
  en: {
    // The Events page with no event open beside the list.
    'd.events.chooseEvent': 'Choose an event',
    // Read aloud on the × that stops narrowing the list to one church or community.
    'd.events.showAll': 'Show all events',
  },
  tw: {
    'd.events.chooseEvent': 'Paw dwumadie bi',
    'd.events.showAll': 'Kyerɛ dwumadie nyinaa',
  },
  ee: {
    'd.events.chooseEvent': 'Tia kpekpe aɖe',
    'd.events.showAll': 'Ɖe kpekpewo katã fia',
  },
  fr: {
    'd.events.chooseEvent': 'Choisis un événement',
    'd.events.showAll': 'Voir tous les événements',
  },
  es: {
    'd.events.chooseEvent': 'Elige un evento',
    'd.events.showAll': 'Ver todos los eventos',
  },
  pt: {
    'd.events.chooseEvent': 'Escolha um evento',
    'd.events.showAll': 'Ver todos os eventos',
  },
  de: {
    'd.events.chooseEvent': 'Wähle eine Veranstaltung',
    'd.events.showAll': 'Alle Veranstaltungen anzeigen',
  },
  it: {
    'd.events.chooseEvent': 'Scegli un evento',
    'd.events.showAll': 'Mostra tutti gli eventi',
  },
  sw: {
    'd.events.chooseEvent': 'Chagua tukio',
    'd.events.showAll': 'Onyesha matukio yote',
  },
  yo: {
    'd.events.chooseEvent': 'Yan ìṣẹ̀lẹ̀ kan',
    'd.events.showAll': 'Fi gbogbo ìṣẹ̀lẹ̀ hàn',
  },
  ha: {
    'd.events.chooseEvent': 'Zaɓi taro',
    'd.events.showAll': 'Nuna duk taruka',
  },
  ig: {
    'd.events.chooseEvent': 'Họrọ mmemme',
    'd.events.showAll': 'Gosi mmemme niile',
  },
  ar: {
    'd.events.chooseEvent': 'اختر فعالية',
    'd.events.showAll': 'عرض كل الفعاليات',
  },
  hi: {
    'd.events.chooseEvent': 'एक इवेंट चुनें',
    'd.events.showAll': 'सभी इवेंट दिखाएँ',
  },
  zh: {
    'd.events.chooseEvent': '选择一个活动',
    'd.events.showAll': '显示所有活动',
  },
  ko: {
    'd.events.chooseEvent': '행사를 선택하세요',
    'd.events.showAll': '모든 행사 보기',
  },
  ja: {
    'd.events.chooseEvent': 'イベントを選んでください',
    'd.events.showAll': 'すべてのイベントを表示',
  },
  ru: {
    'd.events.chooseEvent': 'Выбери событие',
    'd.events.showAll': 'Показать все события',
  },
  tl: {
    'd.events.chooseEvent': 'Pumili ng event',
    'd.events.showAll': 'Ipakita lahat ng event',
  },
  id: {
    'd.events.chooseEvent': 'Pilih acara',
    'd.events.showAll': 'Tampilkan semua acara',
  },
};

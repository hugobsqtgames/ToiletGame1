/** Web builds: MP3 copies (some open-source browsers cannot decode AAC). Same ids as musicSources.ts. */
export const MUSIC_SOURCES = {
  menu: require('../../assets/audio/web/music_menu.mp3'),
  groove: require('../../assets/audio/web/music_groove.mp3'),
  march: require('../../assets/audio/web/music_march.mp3'),
  jazz: require('../../assets/audio/web/music_jazz.mp3'),
  surf: require('../../assets/audio/web/music_surf.mp3'),
  spooky: require('../../assets/audio/web/music_spooky.mp3'),
} as const;
